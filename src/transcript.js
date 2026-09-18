// Android recognition may repeat the beginning of a phrase in later results.
export function mergeTranscript(previous, next) {
  const left = previous.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  const oldWords = left.split(/\s+/);
  const newWords = right.split(/\s+/);
  const comparable = word => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let overlap = 0;
  for (let size = Math.min(oldWords.length, newWords.length); size > 0; size--) {
    if (oldWords.slice(-size).every((word, index) => comparable(word) === comparable(newWords[index]))) {
      overlap = size;
      break;
    }
  }
  return [...oldWords, ...newWords.slice(overlap)].join(' ');
}
