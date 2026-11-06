// A sentence counts as a NEGATIVE interaction only if it says the combination does something unwanted.
export const NEGATIVE = /\b(increas\w*|reduc\w*|decreas\w*|diminish\w*|antagoni[sz]\w*|lower\w*|raise\w*|potentiat\w*|enhanc\w*|risk|toxicity|bleeding|hypotension|hyperkalemia|hypoglycemia|serotonin syndrome|arrhythmia|qt prolongation|avoid\w*|contraindicated|not recommended|should not|do not|monitor\w*|caution|adverse|serious|life-threatening)\b/i;
// ...and not if it says there is no such effect.
export const BENIGN = /\b(no (clinically )?(significant |meaningful )?(interaction|effect|change|difference)s?|did not (alter|affect|change|have)|not (affected|altered|changed)|without (any )?(interaction|effect)|no dose adjustment|no pharmacokinetic)\b/i;
export const STRONG = /\b(avoid\w*|contraindicated|not recommended|should not|do not (use|take|give|administer|coadminister)|must not|life-threatening|fatal)\b/i;
export const isNegativeInteraction = (sentence: string) => NEGATIVE.test(sentence) && !BENIGN.test(sentence);

