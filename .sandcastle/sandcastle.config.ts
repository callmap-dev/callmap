export const config = {
  repo: process.env.GH_REPO ?? 'callmap-dev/callmap',
  base: process.env.BASE_BRANCH ?? 'master',
  model: 'claude-opus-5-5',
};
