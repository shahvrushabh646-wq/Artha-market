import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  return <div className="mx-auto max-w-4xl pb-10" />;
}
