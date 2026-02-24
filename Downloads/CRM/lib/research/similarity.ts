export type SimilarInput = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  industry: string | null;
  seller: string | null;
  potentialScore: number;
};

export type SimilarOutput = SimilarInput & { matchScore: number };

export function rankSimilarCustomers(base: SimilarInput, candidates: SimilarInput[]): SimilarOutput[] {
  return candidates
    .map((candidate) => {
      let similarity = 0;

      if (base.country && candidate.country && base.country === candidate.country) similarity += 30;
      if (base.region && candidate.region && base.region === candidate.region) similarity += 20;
      if (base.industry && candidate.industry && base.industry === candidate.industry) similarity += 25;
      if (base.seller && candidate.seller && base.seller === candidate.seller) similarity += 10;

      similarity += Math.max(0, 15 - Math.abs((base.potentialScore ?? 50) - (candidate.potentialScore ?? 50)) / 2);
      const potentialPriority = (candidate.potentialScore ?? 50) * 0.5;

      return {
        ...candidate,
        matchScore: Math.round(similarity + potentialPriority)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
