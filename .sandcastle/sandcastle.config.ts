export const config = {
  repo: process.env.GH_REPO ?? 'spasoye-json/callmap',
  base: process.env.BASE_BRANCH ?? 'master',
  model: 'claude-opus-5-5',
};
