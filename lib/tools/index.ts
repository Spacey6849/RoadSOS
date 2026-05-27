import { searchRoadSafety, formatSearchResultsForLLM, SearchResult } from './road-safety-search';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export const ROAD_SAFETY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_road_safety',
      description: 'Search the web for current road safety information, emergency services, hospital details, first aid procedures, traffic laws, and accident-related topics. Only use this for road safety and emergency queries. Do NOT make up information; use this tool to get real data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query related to road safety, first aid, or emergency services' },
        },
        required: ['query'],
      },
    },
  },
];

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!args || typeof args !== 'object') {
    if (__DEV__) console.warn(`[tools] executeTool called with invalid args for ${toolName}`);
    return `Error: Invalid arguments for tool ${toolName}`;
  }
  switch (toolName) {
    case 'search_road_safety': {
      const query = String(args.query ?? '');
      if (!query) return 'Error: No search query provided';
      const { results, source } = await searchRoadSafety(query);
      if (source === 'offline') {
        return 'OFFLINE: Cannot search the web. Please answer using your existing knowledge and the reference knowledge provided.';
      }
      return formatSearchResultsForLLM(results);
    }
    default:
      if (__DEV__) console.warn(`[tools] Unknown tool: ${toolName}`);
      return `Unknown tool: ${toolName}`;
  }
}
