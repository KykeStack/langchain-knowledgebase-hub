/* OpenSearch */
import { Client } from "@opensearch-project/opensearch"

const openSearchClient = new Client({
  nodes: [process.env.OPENSEARCH_URL ?? 'http://127.0.0.1:9200'],
})

export default openSearchClient