export function verifyCitations(proposal, groundTruth) {
  const violations = [];
  const validSymbols = new Set(groundTruth.symbols);

  // Check referenced symbols in proposal
  for (const sym of proposal.referencedSymbols || []) {
    if (!validSymbols.has(sym)) {
      violations.push(`Hallucinated symbol: '${sym}' not in grounded file`);
    }
  }

  // Check line boundary citation
  if (proposal.targetLine && (proposal.targetLine < 1 || proposal.targetLine > groundTruth.lineCount)) {
    violations.push(`Invalid line range: ${proposal.targetLine} out of bounds (1..${groundTruth.lineCount})`);
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
