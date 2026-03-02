 /**
 * handlers.js — User-facing command handlers: /split
 */

const {
  stripSuffix,
  getName,
  formatCurrency,
  generateId,
  updateBalance,
  addTransaction,
  getMentionedPhones,
  cacheNames,
  getCachedDisplayNames,
  getNetBetween,
  getOverallNet,
  getParticipants,
  getSimplifiedBalances,
  recordSettlement,
  // User mapping functions
  registerUserMapping,
  findCanonicalPhone,
  normalizeUserId,
  discoverAndRegisterMappings,
} = require('./store');


// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Resolve a text token to { phone, fullId }.
 * Recognises "me/I/myself", @mention phone numbers, and participant names.
 * Uses user ID mapping system to resolve different IDs for the same user.
 * Never resolves to the bot's own identity.
 */
async function resolveIdentity(text, msg, client, chat) {
  const senderFullId = await resolveSenderJid(msg, chat, client);
  const senderId     = normalizeUserId(stripSuffix(senderFullId));
  const botId        = client.info?.wid?._serialized;

  // "me / I / myself" always maps to the message sender
  if (/\b(me|i|myself)\b/i.test(text)) {
    return { phone: senderId, fullId: senderFullId };
  }

  // Strip leading @, punctuation (commas, dots, etc.), normalise to lowercase
  const cleanText = text.replace(/^@/, '').replace(/[^\w\s]/g, '').trim().toLowerCase();
  
  // Try to extract phone number from "Git commit 'phone' (see below for commit info)" format
  // Pattern: Git commit '(\d+)' (see below for commit info)
  const gitCommitMatch = text.match(/git commit\s+'(\d+)'\s+\(see below for commit info\)/i);
  if (gitCommitMatch) {
    const phoneFromGitCommit = gitCommitMatch[1];
    // Try to find this phone in mentionedIds or participants
    for (const fullId of (msg.mentionedIds || [])) {
      if (botId && fullId === botId) continue;
      const phone = stripSuffix(fullId);
      if (phone === phoneFromGitCommit) {
        return { phone, fullId };
      }
    }
    
    for (const p of (chat.participants || [])) {
      if (botId && p.id._serialized === botId) continue;
      const phone = stripSuffix(p.id._serialized);
      if (phone === phoneFromGitCommit) {
        return { phone, fullId: p.id._serialized };
      }
    }
  }

  // First, try to find canonical phone using mapping system
  const canonicalPhone = findCanonicalPhone(cleanText);
  if (canonicalPhone) {
    // We found a canonical phone, now we need to find the fullId for this user
    // Check mentioned IDs first
    for (const fullId of (msg.mentionedIds || [])) {
      if (botId && fullId === botId) continue;
      const phone = stripSuffix(fullId);
      if (phone === canonicalPhone || findCanonicalPhone(phone) === canonicalPhone) {
        return { phone: canonicalPhone, fullId };
      }
    }
    
    // Check participants
    for (const p of (chat.participants || [])) {
      if (botId && p.id._serialized === botId) continue;
      const phone = stripSuffix(p.id._serialized);
      if (phone === canonicalPhone || findCanonicalPhone(phone) === canonicalPhone) {
        return { phone: canonicalPhone, fullId: p.id._serialized };
      }
    }
    
    // If we found canonical phone but no fullId, construct one
    return { phone: canonicalPhone, fullId: `${canonicalPhone}@c.us` };
  }

  // Match by phone number embedded in text (e.g. typed phone, not @-mention)
  for (const fullId of (msg.mentionedIds || [])) {
    if (botId && fullId === botId) continue;
    const phone = stripSuffix(fullId);
    if (cleanText.includes(phone)) return { phone, fullId };
  }

  // Match by participant display name — skip the bot
  for (const p of (chat.participants || [])) {
    if (botId && p.id._serialized === botId) continue;
    const contact = await client.getContactById(p.id._serialized);
    const name    = (contact.pushname || contact.name || '').toLowerCase();
    if (name && (cleanText.includes(name) || name.includes(cleanText))) {
      let phone  = stripSuffix(p.id._serialized);
      let fullId = p.id._serialized;

      // If participant has a LID JID (not a real phone), resolve to @c.us
      if (fullId.includes('@lid')) {
        // 1. Try contact's own id — getContactById on a LID may return phone JID
        const resolvedJid = contact.id?._serialized;
        if (resolvedJid && resolvedJid.endsWith('@c.us')) {
          phone  = stripSuffix(resolvedJid);
          fullId = resolvedJid;
        } else {
          // 2. Find matching @c.us JID in mentionedIds by comparing pushname
          for (const mId of (msg.mentionedIds || [])) {
            if (botId && mId === botId) continue;
            if (!mId.endsWith('@c.us')) continue;
            try {
              const mc    = await client.getContactById(mId);
              const mName = (mc.pushname || mc.name || '').toLowerCase();
              if (mName === name) { phone = stripSuffix(mId); fullId = mId; break; }
            } catch (_) {}
          }
        }
      }

      return { phone, fullId };
    }
  }

  // Fall back to first non-bot @mention when text is empty
  if (!cleanText && msg.mentionedIds && msg.mentionedIds.length > 0) {
    const firstId = msg.mentionedIds.find(id => !botId || id !== botId);
    if (firstId) {
      const phone = stripSuffix(firstId);
      return { phone, fullId: firstId };
    }
  }

  return null;
}

/**
 * Resolve the canonical participant JID for the message sender.
 *
 * In WhatsApp multi-device, msg.author may return a Linked-Device ID (LID)
 * like "80900155019333@c.us" instead of the phone JID "919717517181@c.us".
 * This causes identity mismatches: the sender appears as two different people
 * (one in contributions, one in chat.participants), breaking the self-skip guard.
 *
 * Resolution order:
 *   1. msg.id.participant — raw participant field from message metadata, more
 *                           reliable than msg.author in multi-device sessions
 *   2. msg.author         — standard field; correct in single-device sessions
 *   3. name-based lookup  — find the participant whose contact name matches
 *                           msg._data.notifyName (the display name in the packet)
 *   4. msg.from           — last resort / DM fallback
 */
async function resolveSenderJid(msg, chat, client) {
  const candidates = [msg.id?.participant, msg.author].filter(Boolean);

  if (chat.isGroup && Array.isArray(chat.participants)) {
    // Prefer whichever candidate is actually a known participant
    const participantSet = new Set(chat.participants.map(p => p.id._serialized));

    // Prefer real phone (@c.us) JIDs over LID (@lid) device JIDs.
    // In WhatsApp multi-device, msg.id.participant may return a LID like
    // 'XXXXX5795@lid' before msg.author returns the real phone JID.
    // Storing a LID phone in transactions breaks /summary and @mentions.
    const phoneJidCandidates = candidates.filter(j => j.endsWith('@c.us') && participantSet.has(j));
    if (phoneJidCandidates.length > 0) return phoneJidCandidates[0];

    // Fall back: any candidate in participantSet (including @lid)
    for (const jid of candidates) {
      if (participantSet.has(jid)) return jid;
    }

    // Last resort: match by the display name WhatsApp attaches to every message
    const notifyName = (msg._data?.notifyName || '').toLowerCase();
    if (notifyName) {
      for (const p of chat.participants) {
        try {
          const c = await client.getContactById(p.id._serialized);
          if ((c.pushname || c.name || '').toLowerCase() === notifyName) {
            return p.id._serialized;
          }
        } catch (_) {}
      }
    }
  }

  return candidates[0] || msg.from;
}

/**
 * Extract payer from text and clean the text
 * Returns { payer: { phone, fullId } | null, cleanedText: string, error: string | null }
 */
async function extractPayer(text, msg, client, chat) {
  // Patterns: "paid by @user", "by @user", "paid by me", "by me"
  // Case insensitive, works anywhere in string
  // Improved regex: matches "paid by X" or "by X" where X can be multiple words
  // Use non-greedy capture to stop at next keyword or end
  const payerRegex = /\b(?:paid[ \t]+)?by[ \t]+(@\w+|[^@,\n]+?)(?=,|[ \t]+@|[ \t]+(?:between|for|by|owes|@all)|$|\n)/gi;
  
  const matches = [];
  let match;
  while ((match = payerRegex.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      payerText: match[1].trim()
    });
  }
  
  // Check for multiple payers
  if (matches.length > 1) {
    return {
      payer: null,
      cleanedText: text,
      error: '❌ Multiple payers detected. Please specify only one payer.'
    };
  }
  
  if (matches.length === 0) {
    // No payer specified
    return {
      payer: null,
      cleanedText: text,
      error: null
    };
  }
  
  const { fullMatch, payerText } = matches[0];
  
  // Check for "by" without user
  if (!payerText || payerText.trim() === '') {
    return {
      payer: null,
      cleanedText: text,
      error: '❌ Please specify a payer after "by".'
    };
  }
  
  // Resolve payer identity
  const payer = await resolveIdentity(payerText, msg, client, chat);
  if (!payer) {
    return {
      payer: null,
      cleanedText: text,
      error: `❌ Couldn't find payer "${payerText}" in this group.`
    };
  }
  
  // Remove payer phrase from text
  const cleanedText = text.replace(fullMatch, '').trim();
  
  return {
    payer,
    cleanedText,
    error: null
  };
}

/**
 * Extract participants from text
 * Returns { participants: Array<{ phone, fullId }>, error: string | null }
 */
async function extractParticipants(text, msg, client, chat, payerFullId = null) {
  const senderFullId = await resolveSenderJid(msg, chat, client);
  const senderId = normalizeUserId(stripSuffix(senderFullId));
  const botId = client.info?.wid?._serialized;

  // Check for @all keyword
  const hasAll = text.includes('@all');

  if (hasAll) {
    // @all keyword detected
    // Validate: cannot mix @all with individual mentions (excluding the payer, who is already handled)
    const mentionedIds = msg.mentionedIds || [];
    const payerPhone = payerFullId ? stripSuffix(payerFullId) : null;
    const hasMentions = mentionedIds.some(id => {
      if (botId && id === botId) return false;
      if (payerPhone && stripSuffix(id) === payerPhone) return false;
      return true;
    });

    if (hasMentions) {
      return {
        participants: [],
        error: '❌ Cannot combine @all with individual mentions.'
      };
    }
    
    try {
      // Get all group participants
      const allParticipants = await getAllParticipants(chat, client, senderFullId, senderId);
      return { participants: allParticipants, error: null };
    } catch (error) {
      return {
        participants: [],
        error: error.message
      };
    }
  }
  
  // Check if "between" keyword exists
  const betweenMatch = text.match(/\bbetween\s+(.+)$/i);
  
  if (betweenMatch) {
    // Case A: "between" is present
    const afterBetween = betweenMatch[1].trim();
    
    if (!afterBetween) {
      return {
        participants: [],
        error: '❌ Please specify users after "between".'
      };
    }
    
    // Split by spaces, commas, "and", "&"
    const tokens = afterBetween.split(/[\s,]+|(?:\band\b|\&)/i).map(t => t.trim()).filter(t => t);
    
    const participants = [];
    const seenPhones = new Set();
    
    for (const token of tokens) {
      // Skip empty tokens
      if (!token) continue;
      
      const user = await resolveIdentity(token, msg, client, chat);
      if (!user) {
        return {
          participants: [],
          error: `❌ Couldn't find user "${token}" in this group.`
        };
      }
      
      const canonicalPhone = normalizeUserId(user.phone);
      
      // Check for duplicates
      if (seenPhones.has(canonicalPhone)) {
        return {
          participants: [],
          error: `❌ Duplicate user "${token}" detected.`
        };
      }
      
      seenPhones.add(canonicalPhone);
      participants.push({ phone: canonicalPhone, fullId: user.fullId });
    }
    
    if (participants.length === 0) {
      return {
        participants: [],
        error: '❌ Please specify users after "between".'
      };
    }
    
    return { participants, error: null };
  } else {
    // Case B: no "between" keyword
    // Use mentionedIds ONLY (excluding bot and sender)
    const mentionedIds = msg.mentionedIds || [];
    const participants = [];
    const seenPhones = new Set();
    
    for (const fullId of mentionedIds) {
      if (botId && fullId === botId) continue;
      
      const phone = stripSuffix(fullId);
      const canonicalPhone = normalizeUserId(phone);
      
      // Skip sender unless "me" appears in text
      const hasMeKeyword = /\b(me|i|myself)\b/i.test(text);
      if (canonicalPhone === normalizeUserId(senderId) && !hasMeKeyword) {
        continue;
      }
      
      if (seenPhones.has(canonicalPhone)) continue;
      
      seenPhones.add(canonicalPhone);
      participants.push({ phone: canonicalPhone, fullId });
    }
    
    // Also check for "me" keyword in text
    if (/\b(me|i|myself)\b/i.test(text)) {
      const canonicalSender = normalizeUserId(senderId);
      if (!seenPhones.has(canonicalSender)) {
        participants.push({ phone: canonicalSender, fullId: senderFullId });
      }
    }
    
    if (participants.length === 0) {
      return {
        participants: [],
        error: '❌ Please mention users to split with.'
      };
    }
    
    return { participants, error: null };
  }
}

/** Phone numbers of all participants in a group chat, excluding the bot itself. */
function getGroupPhones(chat, client) {
  if (!chat.isGroup || !Array.isArray(chat.participants)) return [];
  const botId = client.info?.wid?._serialized;
  return chat.participants
    .filter(p => p?.id?._serialized && p.id._serialized !== botId
                 && p.id._serialized.endsWith('@c.us'))
    .map(p => stripSuffix(p.id._serialized));
}

/**
 * Get all group participants for @all keyword.
 * Returns array of { phone, fullId } objects.
 * - Excludes bot ID
 * - Includes sender (if not already in participants)
 * - Ensures no duplicates
 * - Requires group chat with at least 2 participants (excluding bot)
 * - Throws if any participant's identity could not be resolved (unresolved @lid)
 */
async function getAllParticipants(chat, client, senderFullId, senderId) {
  if (!chat.isGroup) {
    throw new Error('❌ @all can only be used in group chats.');
  }

  if (!Array.isArray(chat.participants)) {
    throw new Error('❌ Could not fetch group participants.');
  }

  const botId = client.info?.wid?._serialized;
  const participants = [];
  const seenPhones = new Set();
  let hasUnresolvedLid = false;

  // Add all group participants except bot
  for (const p of chat.participants) {
    if (!p?.id?._serialized) continue;
    if (botId && p.id._serialized === botId) continue;

    const rawPhone = stripSuffix(p.id._serialized);
    const canonicalPhone = normalizeUserId(rawPhone);

    if (p.id._serialized.endsWith('@lid') && canonicalPhone === rawPhone) {
      // Unresolved @lid — cannot safely include this person
      hasUnresolvedLid = true;
      continue;
    }

    if (!seenPhones.has(canonicalPhone)) {
      seenPhones.add(canonicalPhone);
      // For resolved @lid entries, construct a valid @c.us JID for mentions
      const fullId = p.id._serialized.endsWith('@lid')
        ? `${canonicalPhone}@c.us`
        : p.id._serialized;
      participants.push({ phone: canonicalPhone, fullId });
    }
  }

  if (hasUnresolvedLid) {
    throw new Error(
      "❌ Couldn't identify all group members (some appear as device IDs the bot can't resolve).\n" +
      "Please tag participants individually instead:\n" +
      "  /split <amount> @Person1 @Person2 ..."
    );
  }

  // Ensure sender is included
  const senderCanonical = normalizeUserId(senderId);
  if (!seenPhones.has(senderCanonical)) {
    seenPhones.add(senderCanonical);
    participants.push({ phone: senderCanonical, fullId: senderFullId });
  }

  // Validate group size (excluding bot)
  if (participants.length < 2) {
    throw new Error('❌ Group must have at least 2 participants (excluding bot) to use @all.');
  }

  return participants;
}

/**
 * Extract label from message text using STRICT parsing rules
 * Returns { label: string | null, error: string | null }
 * 
 * Supported syntax:
 * 1. NEW LINE label (PRIORITY): Any line starting with "for "
 * 2. INLINE label (fallback): Last occurrence of "for" in first line
 * 
 * STRICT RULES:
 * - "for" must be followed by non-empty text
 * - Everything after "for" is treated as RAW LABEL TEXT
 * - Keywords like "by", "between", "paid", "and" inside label are PLAIN TEXT
 * - New line label takes priority over inline
 * - Max length: 40 characters
 */
function extractLabel(msg) {
  const lines = msg.body.split("\n").map(l => l.trim());
  
  // Step 1: Check for NEW LINE label (PRIORITY)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().startsWith("for ")) {
      const label = line.slice(4).trim();
      
      // Validation
      if (!label) {
        return { label: null, error: '❌ Invalid label. Use: for <description>' };
      }
      
      if (label.length > 40) {
        return { label: null, error: '❌ Label too long. Max 40 characters allowed.' };
      }
      
      return { label, error: null };
    }
  }
  
  // Step 2: Check for INLINE label in first line
  const firstLine = lines[0];
  const tokens = firstLine.split(" ");
  const lastForIndex = tokens.lastIndexOf("for");
  
  if (lastForIndex !== -1) {
    const label = tokens.slice(lastForIndex + 1).join(" ").trim();
    
    // Validation
    if (!label) {
      return { label: null, error: '❌ Invalid label. Use: for <description>' };
    }
    
    if (label.length > 40) {
      return { label: null, error: '❌ Label too long. Max 40 characters allowed.' };
    }
    
    return { label, error: null };
  }
  
  // No label found
  return { label: null, error: null };
}

/**
 * Remove label from text to prevent parsing conflicts
 * Returns { textWithoutLabel: string, label: string | null, error: string | null }
 * 
 * This function should be called BEFORE parsing payer/participants
 * It removes everything after the last "for" in the first line
 */
function removeLabelFromText(text) {
  const lines = text.split("\n").map(l => l.trim());
  
  // Check for NEW LINE label first (priority)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().startsWith("for ")) {
      // For new line label, we don't need to remove anything from the first line
      // The label is on a separate line, so it won't interfere with parsing
      return { textWithoutLabel: lines[0], label: line.slice(4).trim(), error: null };
    }
  }
  
  // Check for INLINE label in first line
  const firstLine = lines[0];
  const tokens = firstLine.split(" ");
  const lastForIndex = tokens.lastIndexOf("for");
  
  if (lastForIndex !== -1) {
    const label = tokens.slice(lastForIndex + 1).join(" ").trim();
    
    // Validation
    if (!label) {
      return { textWithoutLabel: firstLine, label: null, error: '❌ Invalid label. Use: for <description>' };
    }
    
    if (label.length > 40) {
      return { textWithoutLabel: firstLine, label: null, error: '❌ Label too long. Max 40 characters allowed.' };
    }
    
    // Remove everything after "for" from the text
    const textWithoutLabel = tokens.slice(0, lastForIndex).join(" ").trim();
    return { textWithoutLabel, label, error: null };
  }
  
  // No label found
  return { textWithoutLabel: text, label: null, error: null };
}

/**
 * Parse shares-based split from multi-line text
 * Returns { participants: { phone: shares }, error: string } or null if not shares mode
 */
async function parseSharesSplit(text, msg, client, chat, payerFullId = null) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Check if any line contains "share" or "shares" (case-insensitive)
  const hasSharesKeyword = lines.some(line => /\bshares?\b/i.test(line));
  if (!hasSharesKeyword) {
    return null; // Not shares mode
  }

  // Check for mixing modes (shares + owes amounts)
  const hasOwes = lines.some(line => /\bowes\b/i.test(line));
  if (hasOwes) {
    return { error: '❌ Cannot mix owes amounts and shares in the same split. Please use only one type of split.' };
  }

  // Check for mixing modes (shares + percentages)
  const hasPercentage = lines.some(line => /%/.test(line));
  if (hasPercentage) {
    return { error: '❌ Cannot mix shares and percentages in the same split. Please use only one type of split.' };
  }

  // Check for @all keyword in any line
  const hasAll = lines.some(line => line.includes('@all'));

  if (hasAll) {
    // @all keyword detected in shares mode
    // Validate: cannot mix @all with individual mentions (excluding the payer)
    const mentionedIds = msg.mentionedIds || [];
    const botId = client.info?.wid?._serialized;
    const payerPhone = payerFullId ? stripSuffix(payerFullId) : null;
    const hasMentions = mentionedIds.some(id => {
      if (botId && id === botId) return false;
      if (payerPhone && stripSuffix(id) === payerPhone) return false;
      return true;
    });

    if (hasMentions) {
      return { error: '❌ Cannot combine @all with individual mentions.' };
    }
    
    // Get sender info
    const senderFullId = await resolveSenderJid(msg, chat, client);
    const senderId = normalizeUserId(stripSuffix(senderFullId));
    
    try {
      // Get all group participants
      const allParticipants = await getAllParticipants(chat, client, senderFullId, senderId);
      
      // Convert to shares format (equal shares for all)
      const participants = {};
      for (const { phone } of allParticipants) {
        participants[phone] = 1; // Default 1 share each
      }
      
      // Check if shares are specified for @all (e.g., "@all 2 shares")
      const allLine = lines.find(line => line.includes('@all'));
      if (allLine) {
        const allShareMatch = allLine.match(/@all\s+(\d+)\s+shares?/i);
        if (allShareMatch) {
          const allShares = parseInt(allShareMatch[1], 10);
          if (!isNaN(allShares) && allShares > 0) {
            // Apply same shares to all participants
            for (const phone of Object.keys(participants)) {
              participants[phone] = allShares;
            }
          }
        }
      }
      
      return { participants };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  const participants = {};
  const seenUsers = new Set();
  let hasError = false;
  const errors = [];
  
  // Process each line (skip the first line which is the /split command)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip payer specification lines (they start with "by" or "paid by")
    if (/^\s*(?:paid\s+)?by\s+/i.test(line)) {
      continue;
    }
    
    // Skip "for description" lines
    if (/^\s*for\s+/i.test(line)) {
      continue;
    }
    
    // Parse share line: user shares
    // Patterns: "@user 2 shares", "me 1 share", "user 3 shares", "Git commit 'phone' (see below for commit info) 2 shares"
    const shareMatch = line.match(/^(.+?)\s+(\d+)\s+shares?$/i);
    if (!shareMatch) {
      errors.push(`❌ Invalid format: "${line}". Expected: "@user 2 shares" or "me 1 share"`);
      hasError = true;
      continue;
    }
    
    const userText = shareMatch[1].trim();
    const shares = parseInt(shareMatch[2], 10);
    
    // Validate shares
    if (isNaN(shares) || shares <= 0) {
      errors.push(`❌ Shares must be whole numbers greater than 0: "${line}"`);
      hasError = true;
      continue;
    }
    
    // Resolve user identity
    const user = await resolveIdentity(userText, msg, client, chat);
    if (!user) {
      errors.push(`❌ Couldn't find user "${userText}" in this group.`);
      hasError = true;
      continue;
    }
    
    const canonicalPhone = normalizeUserId(user.phone);
    
    // Check for duplicate users
    if (seenUsers.has(canonicalPhone)) {
      errors.push(`❌ Duplicate entries detected for user "${userText}".`);
      hasError = true;
      continue;
    }
    
    seenUsers.add(canonicalPhone);
    participants[canonicalPhone] = shares;
  }
  
  // Validate we have at least one participant
  if (Object.keys(participants).length === 0 && !hasError) {
    errors.push('❌ Could not resolve participants with shares.');
    hasError = true;
  }
  
  if (hasError) {
    return { error: errors.join('\n') };
  }
  
  return { participants };
}

/**
 * Parse percentage-based split from multi-line text
 * Returns { participants: { phone: percentage }, unspecified: Set<phone>, error: string } or null if not percentage mode
 */
async function parsePercentageSplit(text, msg, client, chat, payerFullId = null) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Check if any line contains "%" (percentage mode)
  const hasPercentage = lines.some(line => /%/.test(line));
  if (!hasPercentage) {
    return null; // Not percentage mode
  }

  // Check for mixing modes (percentages + owes amounts)
  const hasOwes = lines.some(line => /\bowes\b/i.test(line));
  if (hasOwes) {
    return { error: '❌ Cannot mix owes amounts and percentages in the same split. Please use only one type of split.' };
  }

  // Check for mixing modes (shares + percentages)
  const hasShares = lines.some(line => /\bshares?\b/i.test(line));
  if (hasShares) {
    return { error: '❌ Cannot mix shares and percentages in the same split.' };
  }

  // Check for @all keyword in any line
  const hasAll = lines.some(line => line.includes('@all'));

  if (hasAll) {
    // @all keyword detected in percentage mode
    // Validate: cannot mix @all with individual mentions (excluding the payer)
    const mentionedIds = msg.mentionedIds || [];
    const botId = client.info?.wid?._serialized;
    const payerPhone = payerFullId ? stripSuffix(payerFullId) : null;
    const hasMentions = mentionedIds.some(id => {
      if (botId && id === botId) return false;
      if (payerPhone && stripSuffix(id) === payerPhone) return false;
      return true;
    });
    
    if (hasMentions) {
      return { error: '❌ Cannot combine @all with individual mentions.' };
    }
    
    // Get sender info
    const senderFullId = await resolveSenderJid(msg, chat, client);
    const senderId = normalizeUserId(stripSuffix(senderFullId));
    
    try {
      // Get all group participants
      const allParticipants = await getAllParticipants(chat, client, senderFullId, senderId);
      
      // Check if percentage is specified for @all (e.g., "@all 50%")
      const allLine = lines.find(line => line.includes('@all'));
      if (allLine) {
        const allPercentageMatch = allLine.match(/@all\s+([\d.]+)%/i);
        if (allPercentageMatch) {
          const allPercentage = parseFloat(allPercentageMatch[1]);
          if (!isNaN(allPercentage) && allPercentage > 0 && allPercentage <= 100) {
            // Equal percentage for all participants
            const equalPercentage = allPercentage / allParticipants.length;
            const participants = {};
            for (const { phone } of allParticipants) {
              participants[phone] = equalPercentage;
            }
            return { participants, unspecified: [] };
          }
        }
      }
      
      // Default: equal percentage for all (100% / number of participants)
      const equalPercentage = 100 / allParticipants.length;
      const participants = {};
      for (const { phone } of allParticipants) {
        participants[phone] = equalPercentage;
      }
      return { participants, unspecified: [] };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  const participants = {};
  const unspecified = new Set();
  const seenUsers = new Set();
  let hasError = false;
  const errors = [];
  let totalPercentage = 0;
  
  // Process each line (skip the first line which is the /split command)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip payer specification lines (they start with "by" or "paid by")
    if (/^\s*(?:paid\s+)?by\s+/i.test(line)) {
      continue;
    }
    
    // Skip "for description" lines
    if (/^\s*for\s+/i.test(line)) {
      continue;
    }
    
    // Parse percentage line: user percentage
    // Patterns: "@user 50%", "me 25%", "@user" (no percentage)
    const percentageMatch = line.match(/^(.+?)\s+([\d.]+)%$/i);
    const userOnlyMatch = line.match(/^([^%\d]+)$/i); // User without percentage
    
    let userText = '';
    let percentage = null;
    
    if (percentageMatch) {
      userText = percentageMatch[1].trim();
      percentage = parseFloat(percentageMatch[2]);
    } else if (userOnlyMatch) {
      userText = userOnlyMatch[1].trim();
      // No percentage specified
    } else {
      errors.push(`❌ Invalid format: "${line}". Expected: "@user 50%" or "@user"`);
      hasError = true;
      continue;
    }
    
    // Resolve user identity
    const user = await resolveIdentity(userText, msg, client, chat);
    if (!user) {
      errors.push(`❌ Couldn't find user "${userText}" in this group.`);
      hasError = true;
      continue;
    }
    
    const canonicalPhone = normalizeUserId(user.phone);
    
    // Check for duplicate users
    if (seenUsers.has(canonicalPhone)) {
      errors.push(`❌ Duplicate entries detected for user "${userText}".`);
      hasError = true;
      continue;
    }
    
    seenUsers.add(canonicalPhone);
    
    // Validate percentage if specified
    if (percentage !== null) {
      if (isNaN(percentage) || percentage <= 0) {
        errors.push(`❌ Invalid percentage value: "${line}". Must be greater than 0.`);
        hasError = true;
        continue;
      }
      
      if (percentage > 100) {
        errors.push(`❌ Percentage cannot exceed 100%: "${line}"`);
        hasError = true;
        continue;
      }
      
      participants[canonicalPhone] = percentage;
      totalPercentage += percentage;
    } else {
      unspecified.add(canonicalPhone);
    }
  }
  
  // Validate we have at least one participant
  if (Object.keys(participants).length === 0 && unspecified.size === 0 && !hasError) {
    errors.push('❌ No participants found.');
    hasError = true;
  }
  
  // Validate total percentage
  if (!hasError) {
    if (totalPercentage > 100) {
      errors.push(`❌ Total percentage exceeds 100% (${totalPercentage.toFixed(2)}%).`);
      hasError = true;
    } else if (totalPercentage === 100 && unspecified.size > 0) {
      errors.push('❌ Extra participants without percentage (total already 100%).');
      hasError = true;
    } else if (totalPercentage < 100 && unspecified.size === 0) {
      errors.push(`❌ Percentages must total 100% (currently ${totalPercentage.toFixed(2)}%).`);
      hasError = true;
    }
  }
  
  if (hasError) {
    return { error: errors.join('\n') };
  }
  
  return { participants, unspecified: Array.from(unspecified) };
}

/**
 * Handle percentage-based split
 */
async function handlePercentageSplit(msg, client, chat, senderId, senderFullId, participantMap,
                                     totalAmount, text, percentageResult, label, specifiedPayer = null) {
  const chatId = msg.from;
  const { participants: percentageParticipants, unspecified } = percentageResult;
  
  // Determine who pays: specified payer or sender
  const payerCanonical = specifiedPayer ? normalizeUserId(specifiedPayer.phone) : normalizeUserId(senderId);
  
  // Calculate total specified percentage
  const totalSpecifiedPercentage = Object.values(percentageParticipants).reduce((sum, pct) => sum + pct, 0);
  
  // Distribute remaining percentage among unspecified users
  const remainingPercentage = 100 - totalSpecifiedPercentage;
  const unspecifiedCount = unspecified.length;
  
  if (unspecifiedCount > 0) {
    const equalPercentage = remainingPercentage / unspecifiedCount;
    for (const phone of unspecified) {
      percentageParticipants[phone] = equalPercentage;
    }
  }
  
  // Add payer to participants if not already included (with 0% - they pay, don't owe)
  // But if payer already has a percentage, keep it (they pay AND owe their share)
  if (!percentageParticipants[payerCanonical]) {
    percentageParticipants[payerCanonical] = 0;
  }
  // Don't overwrite existing percentage - payer can have >0% (they pay AND owe)
  
  // Calculate amounts owed by each participant (except payer who has 0%)
  const liabilities = {};
  const contributions = { [payerCanonical]: totalAmount }; // Payer pays the full amount
  
  for (const [phone, percentage] of Object.entries(percentageParticipants)) {
    if (percentage > 0) {
      const amountOwed = Math.round((totalAmount * percentage / 100) * 100) / 100;
      liabilities[phone] = amountOwed;
    }
  }
  
  // Validate that total liabilities match total amount (account for rounding)
  const totalLiabilities = Object.values(liabilities).reduce((sum, amount) => sum + amount, 0);
  const roundingDifference = Math.round((totalAmount - totalLiabilities) * 100) / 100;
  
  // Adjust for rounding errors by adding to largest liability
  if (Math.abs(roundingDifference) > 0.005) {
    // Find participant with largest liability
    let maxPhone = null;
    let maxAmount = 0;
    for (const [phone, amount] of Object.entries(liabilities)) {
      if (amount > maxAmount) {
        maxAmount = amount;
        maxPhone = phone;
      }
    }
    if (maxPhone) {
      liabilities[maxPhone] = Math.round((liabilities[maxPhone] + roundingDifference) * 100) / 100;
    }
  }
  
  // Get all participants for caching and mentions
  const allParticipants = [...new Set([...Object.keys(contributions), ...Object.keys(liabilities)])];
  await cacheNames(allParticipants, client);
  
  // Update participantMap with canonical phones for mentions
  for (const phone of allParticipants) {
    if (!participantMap[phone]) {
      const canonicalPhone = normalizeUserId(phone);
      for (const p of (chat.participants || [])) {
        if (!p.id._serialized.endsWith('@c.us')) continue;  // skip LID/non-phone JIDs
        const participantPhone = stripSuffix(p.id._serialized);
        if (normalizeUserId(participantPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = p.id._serialized;
          break;
        }
      }
      for (const fullId of (msg.mentionedIds || [])) {
        const mentionedPhone = stripSuffix(fullId);
        if (normalizeUserId(mentionedPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = fullId;
          break;
        }
      }
      if (!participantMap[canonicalPhone]) {
        participantMap[canonicalPhone] = `${canonicalPhone}@c.us`;
      }
    }
  }
  
  // Calculate balance deltas and owed lines
  const balanceDeltas = [];
  const owedLines = [];
  
  for (const [debtor, debt] of Object.entries(liabilities)) {
    for (const [creditor, paid] of Object.entries(contributions)) {
      if (debtor === creditor) continue;
      const share = Math.round((debt * (paid / totalAmount)) * 100) / 100;
      if (share > 0) {
        updateBalance(chatId, debtor, creditor, share);
        balanceDeltas.push({ debtor, creditor, amount: share });
        owedLines.push(`- @${debtor} owes ${formatCurrency(share)}`);
      }
    }
  }
  
  // Add transaction to store
  addTransaction({
    id:           generateId(),
    type:         'expense',
    groupId:      chatId,
    timestamp:    new Date().toISOString(),
    amount:       totalAmount,
    label:        label,
    contributions,
    liabilities,
    participants: allParticipants,
    balanceDeltas,
  });
  
  // Build reply using @phone mentions so WhatsApp renders highlighted tags
  // Show payer's liability if they have one
  const payerLines = Object.entries(contributions).map(([p, a]) => {
    const payerShare = liabilities[p];
    return payerShare
      ? `- @${p} paid ${formatCurrency(a)}, owes ${formatCurrency(payerShare)}`
      : `- @${p} paid ${formatCurrency(a)}`;
  });
  
  const reply = [
    `✅ Split ${formatCurrency(totalAmount)}`,
    `---`,
    `Breakdown:`,
    ...payerLines,
    ...owedLines,
  ].join('\n');

  await client.sendMessage(chatId, reply, {
    mentions: allParticipants.map(p => participantMap[p] || `${p}@c.us`)
  });
}

/**
 * Handle shares-based split
 */
async function handleSharesSplit(msg, client, chat, senderId, senderFullId, participantMap, 
                                 totalAmount, text, sharesParticipants, label, specifiedPayer = null) {
  const chatId = msg.from;
  
  // Determine who pays: specified payer or sender
  const payerCanonical = specifiedPayer ? normalizeUserId(specifiedPayer.phone) : normalizeUserId(senderId);
  
  // Add payer to participants if not already included
  if (!sharesParticipants[payerCanonical]) {
    sharesParticipants[payerCanonical] = 0; // Payer has 0 shares (they're paying, not owing)
  }
  
  // Calculate total shares
  const totalShares = Object.values(sharesParticipants).reduce((sum, shares) => sum + shares, 0);
  if (totalShares === 0) {
    await client.sendMessage(chatId, '❌ Total shares cannot be zero.');
    return;
  }
  
  // Calculate value per share
  const valuePerShare = totalAmount / totalShares;
  
  // Calculate amounts owed by each participant (except payer who has 0 shares)
  const liabilities = {};
  const contributions = { [payerCanonical]: totalAmount }; // Payer pays the full amount
  
  for (const [phone, shares] of Object.entries(sharesParticipants)) {
    if (shares > 0) {
      const amountOwed = Math.round(valuePerShare * shares * 100) / 100;
      liabilities[phone] = amountOwed;
    }
  }
  
  // Validate that total liabilities match total amount (account for rounding)
  const totalLiabilities = Object.values(liabilities).reduce((sum, amount) => sum + amount, 0);
  const roundingDifference = Math.round((totalAmount - totalLiabilities) * 100) / 100;
  
  // Adjust for rounding errors by adding to largest liability
  if (Math.abs(roundingDifference) > 0.005) {
    // Find participant with largest liability
    let maxPhone = null;
    let maxAmount = 0;
    for (const [phone, amount] of Object.entries(liabilities)) {
      if (amount > maxAmount) {
        maxAmount = amount;
        maxPhone = phone;
      }
    }
    if (maxPhone) {
      liabilities[maxPhone] = Math.round((liabilities[maxPhone] + roundingDifference) * 100) / 100;
    }
  }
  
  // Get all participants for caching and mentions
  const allParticipants = [...new Set([...Object.keys(contributions), ...Object.keys(liabilities)])];
  await cacheNames(allParticipants, client);
  
  // Update participantMap with canonical phones for mentions
  for (const phone of allParticipants) {
    if (!participantMap[phone]) {
      const canonicalPhone = normalizeUserId(phone);
      for (const p of (chat.participants || [])) {
        if (!p.id._serialized.endsWith('@c.us')) continue;  // skip LID/non-phone JIDs
        const participantPhone = stripSuffix(p.id._serialized);
        if (normalizeUserId(participantPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = p.id._serialized;
          break;
        }
      }
      for (const fullId of (msg.mentionedIds || [])) {
        const mentionedPhone = stripSuffix(fullId);
        if (normalizeUserId(mentionedPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = fullId;
          break;
        }
      }
      if (!participantMap[canonicalPhone]) {
        participantMap[canonicalPhone] = `${canonicalPhone}@c.us`;
      }
    }
  }
  
  // Calculate balance deltas and owed lines
  const balanceDeltas = [];
  const owedLines = [];
  
  for (const [debtor, debt] of Object.entries(liabilities)) {
    for (const [creditor, paid] of Object.entries(contributions)) {
      if (debtor === creditor) continue;
      const share = Math.round((debt * (paid / totalAmount)) * 100) / 100;
      if (share > 0) {
        updateBalance(chatId, debtor, creditor, share);
        balanceDeltas.push({ debtor, creditor, amount: share });
        owedLines.push(`- @${debtor} owes ${formatCurrency(share)}`);
      }
    }
  }
  
  // Add transaction to store
  addTransaction({
    id:           generateId(),
    type:         'expense',
    groupId:      chatId,
    timestamp:    new Date().toISOString(),
    amount:       totalAmount,
    label:        label,
    contributions,
    liabilities,
    participants: allParticipants,
    balanceDeltas,
  });
  
  // Build reply using @phone mentions so WhatsApp renders highlighted tags
  // Show payer's liability if they have one
  const payerLines = Object.entries(contributions).map(([p, a]) => {
    const payerShare = liabilities[p];
    return payerShare
      ? `- @${p} paid ${formatCurrency(a)}, owes ${formatCurrency(payerShare)}`
      : `- @${p} paid ${formatCurrency(a)}`;
  });
  
  const reply = [
    `✅ Split ${formatCurrency(totalAmount)}`,
    `---`,
    `Breakdown:`,
    ...payerLines,
    ...owedLines,
  ].join('\n');

  await client.sendMessage(chatId, reply, {
    mentions: allParticipants.map(p => participantMap[p] || `${p}@c.us`)
  });
}


// ─── /split ───────────────────────────────────────────────────────────────────

async function handleSplit(msg, client) {
  const chatId       = msg.from;
  const text         = msg.body.trim();
  const chat         = await msg.getChat();
  const senderFullId = await resolveSenderJid(msg, chat, client);
  const senderId     = normalizeUserId(stripSuffix(senderFullId));

  // Build phone → verified fullId map so mentions always use real WhatsApp JIDs,
  // never reconstructed ones that may be invalid (LIDs, group JIDs, etc.)
  const participantMap = { [senderId]: senderFullId };
  for (const p of (chat.participants || [])) {
    if (!p.id._serialized.endsWith('@c.us')) continue;  // skip LID/non-phone JIDs
    const phone = stripSuffix(p.id._serialized);
    if (!participantMap[phone]) participantMap[phone] = p.id._serialized;
  }
  for (const fullId of (msg.mentionedIds || [])) {
    const phone = stripSuffix(fullId);
    if (!participantMap[phone]) participantMap[phone] = fullId;
  }

  // STEP 1: Remove label from text BEFORE parsing payer/participants
  // This prevents label text from interfering with parsing
  const labelRemovalResult = removeLabelFromText(text);
  if (labelRemovalResult.error) {
    await client.sendMessage(chatId, labelRemovalResult.error);
    return;
  }
  
  const { textWithoutLabel, label } = labelRemovalResult;
  
  // STEP 2: Extract payer from text WITHOUT label
  const payerResult = await extractPayer(textWithoutLabel, msg, client, chat);
  if (payerResult.error) {
    await client.sendMessage(chatId, payerResult.error);
    return;
  }
  
  const { payer: specifiedPayer, cleanedText } = payerResult;
  
  const amountMatch = cleanedText.match(/\/split\s+([\d.]+)/i);
  if (!amountMatch) {
    await client.sendMessage(chatId,
      'Usage: /split <amount> [@user1 @user2] [paid by @payer] [for <description>]\n\n' +
      'Examples:\n' +
      '- /split 600 @user1 @user2 (split between mentioned users)\n' +
      '- /split 600 me @user1 (include yourself with "me")\n' +
      '- /split 600 @user1 @user2 paid by @user1\n' +
      '- /split 600 by @user2\n' +
      '- /split 600 for dinner\n' +
      '- /split 600 @user1 owes 400\n' +
      '- /split 600 by @user1 200 by @user2 400\n' +
      '- /split 500 @all (split equally among all group members)\n' +
      '- /split 500 by @user @all (payer specified, split among all)\n' +
      '- /split 500 by @user @all for dinner (with label)\n\n' +
      'Shares mode (multi-line):\n' +
      '/split 600\n' +
      '@user1 2 shares\n' +
      '@user2 1 share\n' +
      'me 1 share\n' +
      'paid by @user1\n\n' +
      'Percentage mode (multi-line):\n' +
      '/split 600\n' +
      '@user1 50%\n' +
      '@user2 25%\n' +
      'me 25%\n' +
      'paid by @user1');
    return;
  }
  const totalAmount = parseFloat(amountMatch[1]);

  // Check for shares mode (using cleaned text)
  const sharesResult = await parseSharesSplit(cleanedText, msg, client, chat, specifiedPayer?.fullId);
  if (sharesResult) {
    if (sharesResult.error) {
      await client.sendMessage(chatId, sharesResult.error);
      return;
    }
    
    // Handle shares mode with specified payer
    return await handleSharesSplit(msg, client, chat, senderId, senderFullId, participantMap, 
                                   totalAmount, cleanedText, sharesResult.participants, label, specifiedPayer);
  }

  // Check for percentage mode (using cleaned text)
  const percentageResult = await parsePercentageSplit(cleanedText, msg, client, chat, specifiedPayer?.fullId);
  if (percentageResult) {
    if (percentageResult.error) {
      await client.sendMessage(chatId, percentageResult.error);
      return;
    }
    
    // Handle percentage mode with specified payer
    return await handlePercentageSplit(msg, client, chat, senderId, senderFullId, participantMap,
                                       totalAmount, cleanedText, percentageResult, label, specifiedPayer);
  }

  // Continue with regular split logic (equal split or custom liabilities)
  // Extract participants using the new standardized system
  const participantsResult = await extractParticipants(cleanedText, msg, client, chat, specifiedPayer?.fullId);
  if (participantsResult.error) {
    await client.sendMessage(chatId, participantsResult.error);
    return;
  }
  
  const participantsList = participantsResult.participants;
  
  // Strip optional "for <description>" suffix from cleaned text
  // Note: We already extracted label using extractLabel(), so we don't need to parse it again
  // But we need to remove any "for" text from the cleaned text to avoid parsing issues
  const forIndex  = cleanedText.toLowerCase().lastIndexOf(' for ');
  let mainText  = forIndex !== -1 ? cleanedText.slice(0, forIndex) : cleanedText;

  // Parse "by <person> <amount>" and "<person> owes <amount>" segments
  const contributions = {};  // canonical phone → amount paid
  const liabilities   = {};  // canonical phone → amount owed

  for (const seg of mainText.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)) {
    const byMatch   = seg.match(/\bby\s+(.+?)\s+([\d.]+)\b/i);
    const owesMatch = seg.match(/\b(.+?)\s+owes\s+([\d.]+)\b/i);

    if (byMatch) {
      const res = await resolveIdentity(byMatch[1].trim(), msg, client, chat);
      if (res) {
        const canonicalPhone = normalizeUserId(res.phone);
        contributions[canonicalPhone] = (contributions[canonicalPhone] || 0) + parseFloat(byMatch[2]);
      }
    } else if (owesMatch) {
      const res = await resolveIdentity(owesMatch[1].trim(), msg, client, chat);
      if (res) {
        const canonicalPhone = normalizeUserId(res.phone);
        liabilities[canonicalPhone] = (liabilities[canonicalPhone] || 0) + parseFloat(owesMatch[2]);
      }
    }
  }

  // Determine who pays: specified payer or sender
  const payerCanonical = specifiedPayer ? normalizeUserId(specifiedPayer.phone) : normalizeUserId(senderId);
  
  // Sender (or specified payer) covers any unaccounted portion of the total
  const totalPaid = Object.values(contributions).reduce((s, v) => s + v, 0);
  if (totalPaid < totalAmount) {
    contributions[payerCanonical] = (contributions[payerCanonical] || 0) + (totalAmount - totalPaid);
  }

  // Validate that owes amounts add up to total split amount (if liabilities are specified)
  if (Object.keys(liabilities).length > 0) {
    const totalLiabilities = Object.values(liabilities).reduce((sum, amount) => sum + amount, 0);
    const difference = Math.abs(totalLiabilities - totalAmount);
    
    // Allow small rounding differences (0.01)
    if (difference > 0.01) {
      await client.sendMessage(chatId,
        `❌ The owes amounts (${formatCurrency(totalLiabilities)}) don't add up to the split amount (${formatCurrency(totalAmount)}). ` +
        `Difference: ${formatCurrency(difference)}\n\n` +
        'Please check your amounts. Example:\n' +
        '/split 600 @Mohit owes 200 @Kritika owes 400');
      return;
    }
  }

  // Default to equal split among all involved parties when no liabilities given
  if (Object.keys(liabilities).length === 0) {
    // Use the participants extracted by extractParticipants()
    if (participantsList.length === 0) {
      await client.sendMessage(chatId,
        '❌ Please mention users to split with.\n\n' +
        'Examples:\n' +
        '- /split 500 @user1 @user2\n' +
        '- /split 500 me @user1\n' +
        '- /split 500 between me and @user1');
      return;
    }

    const perShare = Math.round((totalAmount / participantsList.length) * 100) / 100;
    for (const { phone } of participantsList) {
      liabilities[phone] = perShare;
    }
  }

  const participants = [...new Set([...Object.keys(contributions), ...Object.keys(liabilities)])];
  await cacheNames(participants, client);
  
  // Update participantMap with canonical phones for mentions
  for (const phone of participants) {
    if (!participantMap[phone]) {
      // Try to find a fullId for this canonical phone
      const canonicalPhone = normalizeUserId(phone);
      for (const p of (chat.participants || [])) {
        if (!p.id._serialized.endsWith('@c.us')) continue;  // skip LID/non-phone JIDs
        const participantPhone = stripSuffix(p.id._serialized);
        if (normalizeUserId(participantPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = p.id._serialized;
          break;
        }
      }
      for (const fullId of (msg.mentionedIds || [])) {
        const mentionedPhone = stripSuffix(fullId);
        if (normalizeUserId(mentionedPhone) === canonicalPhone) {
          participantMap[canonicalPhone] = fullId;
          break;
        }
      }
      // If still not found, construct one
      if (!participantMap[canonicalPhone]) {
        participantMap[canonicalPhone] = `${canonicalPhone}@c.us`;
      }
    }
  }

  // Calculate proportional debt shares and record balance deltas for reversibility
  const totalContributions = Object.values(contributions).reduce((s, v) => s + v, 0);
  const balanceDeltas = [];
  const owedLines     = [];

  for (const [debtor, debt] of Object.entries(liabilities)) {
    for (const [creditor, paid] of Object.entries(contributions)) {
      if (debtor === creditor) continue;
      const share = Math.round((debt * (paid / totalContributions)) * 100) / 100;
      if (share > 0) {
        updateBalance(chatId, debtor, creditor, share);
        balanceDeltas.push({ debtor, creditor, amount: share });
        owedLines.push(`- @${debtor} owes ${formatCurrency(share)}`);
      }
    }
  }

  addTransaction({
    id:           generateId(),
    type:         'expense',
    groupId:      chatId,
    timestamp:    new Date().toISOString(),
    amount:       totalAmount,
    label:        label,
    contributions,
    liabilities,
    participants,   // stored for easy filtering in /history
    balanceDeltas,  // stored for clean reversal in /delete
  });

  // Format response with label if exists
  const labelText = label ? ` — ${label}` : '';
  const payerLines = Object.entries(contributions).map(([p, a]) => {
    const payerShare = liabilities[p];
    return payerShare
      ? `- @${p} paid ${formatCurrency(a)}, owes ${formatCurrency(payerShare)}`
      : `- @${p} paid ${formatCurrency(a)}`;
  });
  const reply = [
    `✅ Split ${formatCurrency(totalAmount)}${labelText}`,
    `---`,
    `Breakdown:`,
    ...payerLines,
    ...owedLines,
  ].join('\n');

  await client.sendMessage(chatId, reply, { mentions: participants.map(p => participantMap[p] || `${p}@c.us`) });
}


// ─── /balances ────────────────────────────────────────────────────────────────

async function handleBalances(msg, client) {
  const chatId       = msg.from;
  const text         = msg.body.trim();
  const chat         = await msg.getChat();
  const senderFullId = await resolveSenderJid(msg, chat, client);
  const senderId     = normalizeUserId(stripSuffix(senderFullId));

  const words = text.split(/\s+/);

  if (words.length > 1) {
    // /balances @Person — balance between sender and one specific person
    const targetText = words.slice(1).join(' ');
    const target     = await resolveIdentity(targetText, msg, client, chat);
    if (!target) {
      await client.sendMessage(chatId,
        `❌ Couldn't find "${targetText}" in this group.\nUsage: /balances [@Person]`);
      return;
    }

    const senderCanonical = normalizeUserId(senderId);
    const targetCanonical = normalizeUserId(target.phone);
    await cacheNames([senderCanonical, targetCanonical], client);
    const result = getNetBetween(chatId, senderCanonical, targetCanonical);

    let reply;
    if (result.settled) {
      reply = `✅ You and @${targetCanonical} are fully settled up!`;
    } else if (result.owes === senderCanonical) {
      reply = `🔴 You owe @${targetCanonical} ${formatCurrency(result.amount)}`;
    } else {
      reply = `🟢 @${targetCanonical} owes you ${formatCurrency(result.amount)}`;
    }

    await client.sendMessage(chatId, reply, { mentions: [senderFullId, target.fullId] });
    return;
  }

  // /balances — read from stored ledger, tag users via participantMap
  const botPhone        = stripSuffix(client.info?.wid?._serialized || '');
  const senderCanonical = normalizeUserId(senderId);
  const allParticipants = getParticipants(chatId).filter(p => {
    const canonicalP = normalizeUserId(p);
    return canonicalP !== botPhone && canonicalP !== senderCanonical;
  });

  // Build phone → fullId map from current group members for @tagging
  const participantMap = {};
  for (const p of (chat.participants || [])) {
    if (!p.id._serialized.endsWith('@c.us')) continue;  // skip LID/non-phone JIDs
    const phone = stripSuffix(p.id._serialized);
    const canonicalPhone = normalizeUserId(phone);
    participantMap[canonicalPhone] = p.id._serialized;
  }

  const lines         = [];
  const mentionFullIds = [];
  const uniqueParticipants = new Set();
  
  for (const phone of allParticipants) {
    const canonicalPhone = normalizeUserId(phone);
    if (uniqueParticipants.has(canonicalPhone)) continue;
    uniqueParticipants.add(canonicalPhone);
    
    const result = getNetBetween(chatId, senderCanonical, canonicalPhone);
    if (result.settled) continue;
    
    const fullId = participantMap[canonicalPhone];
    if (fullId) mentionFullIds.push(fullId);
    const display = fullId ? `@${canonicalPhone}` : getName(canonicalPhone);
    
    if (result.owes === senderCanonical) {
      lines.push(`🔴 You owe ${display} ${formatCurrency(result.amount)}`);
    } else {
      lines.push(`🟢 ${display} owes you ${formatCurrency(result.amount)}`);
    }
  }

  const net = getOverallNet(chatId, senderCanonical);
  let header;
  if (net === 0 && lines.length === 0) {
    header = `✅ You are all square`;
  } else if (net > 0) {
    header = `🟢 In total you are owed ${formatCurrency(net)}`;
  } else {
    header = `🔴 In total you owe ${formatCurrency(Math.abs(net))}`;
  }

  const sendOpts = mentionFullIds.length > 0 ? { mentions: mentionFullIds } : {};
  await client.sendMessage(chatId, [header, ...lines].join('\n'), sendOpts);
}


// ─── /paid & /got ────────────────────────────────────────────────────────────

/**
 * Parse /paid command: "/paid 500 to @Mohit" or "/paid 500 @Mohit"
 * Returns { amount, counterpartyText } or null if parsing fails
 */
function parsePaidCommand(text) {
  // Remove /paid prefix and trim
  const cleanText = text.replace(/^\/paid\s+/i, '').trim();
  if (!cleanText) return null;
  
  // Match amount (with optional ₹ symbol) and counterparty
  // Patterns:
  // 1. /paid 500 to @Mohit
  // 2. /paid 500 @Mohit  
  // 3. /paid ₹500 to Mohit
  // 4. /paid 500 to Mohit for dinner (ignore extra text)
  const match = cleanText.match(/^(?:₹)?([\d.]+)\s+(?:to\s+)?([^0-9]+?)(?:\s+for\s+.+)?$/i);
  if (!match) {
    // Try pattern without "to": /paid 500 @Mohit
    const match2 = cleanText.match(/^(?:₹)?([\d.]+)\s+([^0-9].*)$/i);
    if (!match2) return null;
    return {
      amount: parseFloat(match2[1]),
      counterpartyText: match2[2].trim()
    };
  }
  
  return {
    amount: parseFloat(match[1]),
    counterpartyText: match[2].trim()
  };
}

/**
 * Parse /got command: "/got 600 from @Mohit" or "/got 600 @Mohit"
 * Returns { amount, counterpartyText } or null if parsing fails
 */
function parseGotCommand(text) {
  // Remove /got prefix and trim
  const cleanText = text.replace(/^\/got\s+/i, '').trim();
  if (!cleanText) return null;
  
  // Match amount (with optional ₹ symbol) and counterparty
  // Patterns:
  // 1. /got 600 from @Mohit
  // 2. /got 600 @Mohit
  // 3. /got ₹600 from Mohit
  const match = cleanText.match(/^(?:₹)?([\d.]+)\s+(?:from\s+)?([^0-9]+?)(?:\s+for\s+.+)?$/i);
  if (!match) {
    // Try pattern without "from": /got 600 @Mohit
    const match2 = cleanText.match(/^(?:₹)?([\d.]+)\s+([^0-9].*)$/i);
    if (!match2) return null;
    return {
      amount: parseFloat(match2[1]),
      counterpartyText: match2[2].trim()
    };
  }
  
  return {
    amount: parseFloat(match[1]),
    counterpartyText: match[2].trim()
  };
}

/**
 * Common handler for /paid and /got commands
 */
async function handleSettlement(msg, client, isPaidCommand) {
  const chatId       = msg.from;
  const text         = msg.body.trim();
  const chat         = await msg.getChat();
  const senderFullId = await resolveSenderJid(msg, chat, client);
  const senderId     = normalizeUserId(stripSuffix(senderFullId));
  
  // Parse command
  const parseResult = isPaidCommand 
    ? parsePaidCommand(text)
    : parseGotCommand(text);
  
  if (!parseResult) {
    await client.sendMessage(chatId,
      `❌ Couldn't understand that.\n\nUse:\n` +
      `- /paid <amount> to @user\n` +
      `- /got <amount> from @user\n\n` +
      `Examples:\n` +
      `- /paid 500 to @Mohit\n` +
      `- /got 300 from @Vipul`);
    return;
  }
  
  const { amount, counterpartyText } = parseResult;
  
  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    await client.sendMessage(chatId, '❌ Amount must be a positive number.');
    return;
  }
  
  // Resolve counterparty
  const counterparty = await resolveIdentity(counterpartyText, msg, client, chat);
  if (!counterparty) {
    await client.sendMessage(chatId, `❌ Couldn't find "${counterpartyText}" in this group.`);
    return;
  }
  
  // Check for self-payment
  const senderCanonical = normalizeUserId(senderId);
  const counterpartyCanonical = normalizeUserId(counterparty.phone);
  
  if (senderCanonical === counterpartyCanonical) {
    await client.sendMessage(chatId, '❌ Cannot record payment to yourself.');
    return;
  }
  
  // Check for multiple users (should only be one)
  const mentionedPhones = getMentionedPhones(msg);
  const botPhone = stripSuffix(client.info?.wid?._serialized || '');
  const validMentions = mentionedPhones.filter(p => p !== botPhone && normalizeUserId(p) !== senderCanonical);
  
  if (validMentions.length > 1) {
    await client.sendMessage(chatId, '❌ Please mention only one user.');
    return;
  }
  
  // Cache names for display
  await cacheNames([senderCanonical, counterpartyCanonical], client);
  
  try {
    // Record settlement
    if (isPaidCommand) {
      // /paid: sender paid counterparty
      // So: from = sender, to = counterparty
      recordSettlement(chatId, senderCanonical, counterpartyCanonical, amount);
      
      const reply = `✅ Payment recorded:\n@${senderCanonical} paid @${counterpartyCanonical} ${formatCurrency(amount)}`;
      await client.sendMessage(chatId, reply, {
        mentions: [senderFullId, counterparty.fullId]
      });
    } else {
      // /got: sender received from counterparty
      // So: from = counterparty, to = sender
      recordSettlement(chatId, counterpartyCanonical, senderCanonical, amount);

      const reply = `✅ Payment recorded:\n@${counterpartyCanonical} paid @${senderCanonical} ${formatCurrency(amount)}`;
      await client.sendMessage(chatId, reply, { 
        mentions: [senderFullId, counterparty.fullId] 
      });
    }
  } catch (error) {
    console.error('Error recording settlement:', error);
    await client.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

/**
 * Handler for /paid command
 */
async function handlePaid(msg, client) {
  return handleSettlement(msg, client, true);
}

/**
 * Handler for /got command
 */
async function handleGot(msg, client) {
  return handleSettlement(msg, client, false);
}


// ─── /help ───────────────────────────────────────────────────────────────────

/**
 * Handler for /help command
 */
async function handleHelp(msg, client) {
  const helpMessage = 
`🤖 *SplitWala* — no more "bhai tu de na" 😄

━━ 🚀 Start Here ━━
Split ₹600:
/split 600 @all
/split 200 between @friend1 and me
/split 600 by @friend1 between @friend1 and me

Add description:
/split 600 by @friend2 between @friend2 @friend3 and me 
for dinner 🍽️

━━ 🧠 Smart Splits ━━

💰 Unequal amounts:
/split 600 @friend1 owes 200 me owes 400

⚖️ Shares:
/split 600
@friend1 2 shares
me 1 share
for lunch

📊 Percentages:
/split 600
@friend1 60%
me 40%
for petrol pump

━━ 💸 Settle Up ━━

/paid 500 to @user
/got 500 from @user

━━ 📊 Who Owes What ━━

/balances
/summary

━━ 🧾 Manage ━━

/history
/delete
/resetall ⚠️

⚠️ Use @mentions only (no names)`;

  await client.sendMessage(msg.from, helpMessage);
}


// ─── /summary ─────────────────────────────────────────────────────────────────

/**
 * Handler for /summary command
 * Shows simplified pairwise balances for the entire group
 */
async function handleSummary(msg, client) {
  const chatId = msg.from;
  const chat = await msg.getChat();

  const simplified = getSimplifiedBalances(chatId);

  if (simplified.length === 0) {
    const participants = getParticipants(chatId);
    if (participants.length === 0) {
      await client.sendMessage(chatId, 'No expenses recorded yet.');
    } else {
      await client.sendMessage(chatId, '✅ All settled up!');
    }
    return;
  }

  // Build phone → fullId map from current group members (same pattern as /split, /balances).
  // Also store the canonical-phone key so lookups succeed even when tx.from holds a
  // historical LID phone that normalizeUserId() can now resolve to the real phone.
  const participantMap = {};
  for (const p of (chat.participants || [])) {
    if (!p.id._serialized.endsWith('@c.us')) continue;  // skip @lid JIDs
    const phone = stripSuffix(p.id._serialized);
    const canonical = normalizeUserId(phone);
    if (!participantMap[phone])    participantMap[phone]    = p.id._serialized;
    if (canonical !== phone && !participantMap[canonical]) participantMap[canonical] = p.id._serialized;
  }

  // Build summary lines with @mentions; fall back to getName() if JID not found.
  // Normalize tx.from/tx.to so historical LID phones resolve to the canonical phone
  // (which IS in participantMap) rather than looking up the raw LID phone (which isn't).
  // Pre-resolve names for phones not reachable via @c.us participantMap
  // (covers @lid-only users who never messaged the bot)
  const allPhones = [...new Set(simplified.flatMap(tx => [normalizeUserId(tx.from), normalizeUserId(tx.to)]))];
  const nameCache = await getCachedDisplayNames(client, allPhones.map(p => `${p}@c.us`));

  const lines = [];
  const mentions = [];

  for (const tx of simplified) {
    const fromPhone  = normalizeUserId(tx.from);
    const toPhone    = normalizeUserId(tx.to);
    const fromFullId = participantMap[tx.from] || participantMap[fromPhone];
    const toFullId   = participantMap[tx.to]   || participantMap[toPhone];

    // Use canonical phone in @mention text so it matches the fullId JID's phone number
    const fromText = fromFullId ? `@${fromPhone}` : (nameCache.get(`${fromPhone}@c.us`) || getName(tx.from));
    const toText   = toFullId   ? `@${toPhone}`   : (nameCache.get(`${toPhone}@c.us`)   || getName(tx.to));

    lines.push(`${fromText} owes ${toText} ${formatCurrency(tx.amount)}`);

    if (fromFullId && !mentions.includes(fromFullId)) mentions.push(fromFullId);
    if (toFullId   && !mentions.includes(toFullId))   mentions.push(toFullId);
  }

  const reply = `✨ Balances simplified through the magic of SplitWala ✨\n\n💰 Final Summary:\n\n${lines.join('\n')}`;

  await client.sendMessage(chatId, reply, mentions.length > 0 ? { mentions } : {});
}


module.exports = { handleSplit, handleBalances, handlePaid, handleGot, handleHelp, handleSummary };
