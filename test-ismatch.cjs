function getQueryParts(playerName) {
  if (!playerName) return [];
  const clean = playerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  return clean.split(/[\s,.-]+/).filter(Boolean);
}

function isPlayerNameMatch(tPlayerName, queryParts) {
  if (!tPlayerName || queryParts.length === 0) return false;
  const cleanCandidate = tPlayerName
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .toLowerCase()
    .trim();
  const candidateWords = cleanCandidate.split(/[\s,.-]+/).filter(Boolean);
  return queryParts.every(part => 
    candidateWords.some(word => word === part)
  );
}

const queryParts = getQueryParts("Gavrilo Novkovic");
console.log(isPlayerNameMatch("Novkovic, Gavrilo", queryParts));
