import type { StrategyRequirements, StrategySource } from "@shared/strategy";

export const meanReversionTemplate: {
  name: string;
  description?: string;
  tags?: string[];
  requirements: StrategyRequirements;
  source: StrategySource;
} = {
  name: "Mean Reversion Sample",
  description: "A minimal mean reversion strategy template with example params.",
  tags: ["mean-reversion", "sample"],
  requirements: {
    packages: [
      { name: "vectorbt", version: ">=0.25" },
      { name: "pandas" },
    ],
  },
  source: {
    language: "python",
    params: { window: 14, z_threshold: 1.5 },
    content: `# Mean Reversion Strategy (Template)\n# Params: window=14, z_threshold=1.5\n\nimport pandas as pd\n\nclass Strategy:\n    def __init__(self, params):\n        self.window = params.get('window', 14)\n        self.z = params.get('z_threshold', 1.5)\n\n    def run(self, close: pd.Series):\n        ma = close.rolling(self.window).mean()\n        std = close.rolling(self.window).std(ddof=0)\n        zscore = (close - ma) / std\n        # signal: buy when below -z, sell when above +z\n        long = zscore < -self.z\n        short = zscore > self.z\n        return {\n            'long': long.astype(int),\n            'short': short.astype(int),\n            'zscore': zscore\n        }\n`,
  },
};
