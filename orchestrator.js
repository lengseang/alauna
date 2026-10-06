import { route } from './gateway.js';
import { groundFile } from './grounder.js';
import { verifyCitations } from './critic.js';
import { formatHumanResponse } from './humanizer.js';

export function executeDecision(input, targetPath = null, candidateProposal = null) {
  const decision = route(input);

  // Short-circuit: Rapport or direct speed-run needs no heavy triad
  if (decision.category === 'RAPPORT' || !targetPath) {
    const status = 'BYPASS_VERIFIER';
    return { decision, status, humanMessage: formatHumanResponse({ status, decision }) };
  }

  // 1. Ground truth step
  const groundTruth = groundFile(targetPath);
  if (!groundTruth.ok) {
    const status = 'GROUNDING_FAILED';
    return { decision, status, error: groundTruth.error, humanMessage: formatHumanResponse({ status, decision }) };
  }

  // 2. Adversarial critic step
  if (candidateProposal) {
    const audit = verifyCitations(candidateProposal, groundTruth);
    if (!audit.valid) {
      const status = 'REJECTED_HALLUCINATION';
      return {
        decision,
        status,
        violations: audit.violations,
        humanMessage: formatHumanResponse({ status, decision, violations: audit.violations })
      };
    }
  }

  const status = 'VERIFIED';
  return {
    decision,
    status,
    groundTruth: { filePath: groundTruth.filePath, symbols: groundTruth.symbols.length },
    humanMessage: formatHumanResponse({ status, decision, details: { symbols: groundTruth.symbols.length } })
  };
}
