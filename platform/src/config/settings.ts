import path from "path";

interface Settings {
  port: number;
  cosmos: {
    endpoint: string;
    key: string;
    database: string;
  };
  ngoConnectorsPath: string;
  useLocalFallback: boolean;
}

function loadSettings(): Settings {
  const cosmosEndpoint = process.env.COSMOS_ENDPOINT || "";
  const cosmosKey = process.env.COSMOS_KEY || "";

  return {
    port: parseInt(process.env.PORT || "3001", 10),
    cosmos: {
      endpoint: cosmosEndpoint,
      key: cosmosKey,
      database: process.env.COSMOS_DATABASE || "connector-platform",
    },
    ngoConnectorsPath:
      process.env.NGO_CONNECTORS_PATH ||
      path.resolve(__dirname, "..", "..", ".."),
    useLocalFallback: !cosmosEndpoint || !cosmosKey,
  };
}

export const settings = loadSettings();
