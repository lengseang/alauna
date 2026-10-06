// Human voice synthesizer: turns cold verification data into natural human talk

export function formatHumanResponse({ status, decision, violations, details }) {
  if (status === 'BYPASS_VERIFIER') {
    return "All set on this end. Clean route, zero blockers—ready when you are.";
  }

  if (status === 'REJECTED_HALLUCINATION') {
    const list = violations.map(v => `• ${v}`).join('\n');
    return `Hold up, caught a hallucination in that draft:\n${list}\n\nI stopped it before it touched your code so nothing breaks. Let's fix that reference first.`;
  }

  if (status === 'GROUNDING_FAILED') {
    return `Couldn't find that file on disk. Double-check the path so we're looking at real code before running the check.`;
  }

  if (status === 'VERIFIED') {
    const symCount = details?.symbols ?? 0;
    return `Looked over the code against disk—found ${symCount} verified symbols. Everything checks out, no invented variables or broken imports. Good to roll.`;
  }

  return "Got it. What do you want to hit next?";
}
