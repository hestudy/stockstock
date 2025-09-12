import React from "react";
import StrategyEditor from "../../../components/forms/StrategyEditor";

export const metadata = {
  title: "Backtests | Strategy Editor",
};

export default function BacktestsPage() {
  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold mb-4">策略编辑器</h1>
      <StrategyEditor />
    </main>
  );
}
