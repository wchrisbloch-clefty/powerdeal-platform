export { buildBriefPrompt } from './brief';
export { buildQualifyPrompt } from './qualify';
export { buildPlanPrompt } from './plan';
export { buildMapPrompt } from './map-gen';
export { buildOutreachPrompt } from './outreach';
export { buildCampaignPrompt, type CampaignContext } from './campaign';
export { buildIntelPrompt, buildPortfolioIntelPrompt } from './intel';
export { buildMarketWatchPrompt, type MarketWatchItem } from './market-watch';
export { buildPersuadePrompt, type PersuadeContext } from './persuade';
export {
  AUDIENCE_PERSONAS,
  getAudienceContext,
  dealBlock,
  signalsBlock,
  marketWatchBlock,
  territoryBlock,
  type PromptContext,
} from './shared';
