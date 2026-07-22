import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTenantsTool from "./tools/list-tenants";
import listAiAgentsTool from "./tools/list-ai-agents";
import getCommandCenterTool from "./tools/get-command-center";
import updateDecisionStatusTool from "./tools/update-decision-status";
import resolveRiskAlertTool from "./tools/resolve-risk-alert";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "maria-os-mcp",
  title: "MarIA OS Agent Integrations",
  version: "0.1.0",
  instructions:
    "Use these tools to inspect MarIA OS tenants, AI agents, command-center signals, pending business decisions, and risk alerts. Every tool runs as the signed-in user and must respect that user's tenant membership and app permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listTenantsTool,
    listAiAgentsTool,
    getCommandCenterTool,
    updateDecisionStatusTool,
    resolveRiskAlertTool,
  ],
});