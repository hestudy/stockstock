export type StrategyMetadata = {
  name: string;
  tags: string[];
  description?: string;
  versionTimestamp: string; // ISO-8601
};

export type StrategyRequirements = {
  packages: Array<{ name: string; version?: string }>;
};

export type StrategySource = {
  language: "python"; // MVP 固定
  content: string;
  params: Record<string, any>;
};

export type StrategyDraft = {
  metadata: StrategyMetadata;
  requirements: StrategyRequirements;
  source: StrategySource;
};
