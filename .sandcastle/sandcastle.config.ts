export const config = {
  repo: process.env.GH_REPO ?? 'spasoye-json/callmap',
  base: process.env.BASE_BRANCH ?? 'master',
  defaultModel: 'claude-opus-5-5',
  reviewModel: 'claude-fable-5-1',
};
