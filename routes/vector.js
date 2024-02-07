import { sanitize, getFileType } from '../modules/global.js'
import { Router } from 'express';
import { cache } from '../clients/redisClient.js'

/* Functions from Module */
import { handleUrlOrHtml, handleSitemap, handlePdf, handleUnstructured, ifCollectionExist } from '../modules/vectorize.js'

/* Open AI | LLM*/
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { OpenAIEmbeddings, ChatOpenAI} from '@langchain/openai'

/* Parsers */
import { WebBrowser } from 'langchain/tools/webbrowser'

/* Load environment variables from .env file */
import * as dotenv from 'dotenv'

const dotenvConfig = dotenv.config()
const router = Router() 

/* Delete a collection  */
router.delete('/collection', async (req, res) => {
  const { collection } = req.body
  if (!collection) {
    res.status(500).json({ message: 'Missing collection' })
    return
  }
  try {
    const indexExist = await ifCollectionExist(await sanitize(collection))

    if (!indexExist) { 
      res.status(400).json({ success: false, message: `${collection} does not exist` })
      return
    }

    indexExist.deleteIfExists()
    res.json({ success: true, message:  `${collection} has been deleted` })
    
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Error deleting the collection' })
  }
})

/* Main endpoint to add content to OpenSearch  */
router.post('/add', async (req, res) => {
  const {
    url,
    collection = process.env.OPENSEARCH_DEFAULT_INDEX,
    filter,
    limit,
    chunkSize = 2000,
    chunkOverlap = 250,
    sleep = 0,
  } = req.body;

  const downloadDir = process.env.DOCS_DIRECTORY || 'docs';

  if (!url) {
    res.status(500).json({ message: 'Missing URL' });
    return;
  }

  const encodedCollection = await sanitize(collection);
  const type = await getFileType(url);
  switch (type) {
    case 'URL':
      await handleUrlOrHtml(
        url, encodedCollection, chunkSize, chunkOverlap, res);
      break;
  
    case 'SITEMAP':
      await handleSitemap(
        url, encodedCollection, chunkSize, chunkOverlap, filter, limit, res);
      break;

    case 'PDF':
      await handlePdf(
        url, encodedCollection, chunkSize, chunkOverlap, downloadDir, res);
      break;

    case 'UNSTRUCTURED':
      await handleUnstructured(
        url, encodedCollection, chunkSize, chunkOverlap, downloadDir, res);
      break;

    default:
      res.status(400).json({ message: `Unsupported file type: ${type}` });
  }
});

/* Get a response using live webpage as context */
router.post('/live', async (req, res) => {
  const { 
    url, 
    question, 
    temperature = 0,
    model = 'gpt-3.5-turbo',
    max_tokens = 1000,
    streaming = false
  } = req.body
  if (!url || !question) {
    res.status(500).json({ message: 'Missing URL/Question' })
    return
  }
  try {
    const llm = new ChatOpenAI({ 
      temperature: temperature,
      concurrency: 15,
      streaming: streaming,
      modelName: model,
      maxTokens: max_tokens,
    });

    const embeddings = new OpenAIEmbeddings();
    const browser = new WebBrowser({ model: llm, embeddings });
    const result = await browser.call(`"${url}","${question}"`);

    // Return the response to the user
    res.json({ response: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Error processing the request' })
  }
})

/* Get a response using the vector store */
router.post('/question', async (req, res) => {
  const {
    question,
    collection = process.env.OPENSEARCH_DEFAULT_INDEX,
    model = 'gpt-3.5-turbo',
    k = 3,
    temperature = 0,
    max_tokens = 10000,
    streaming = false
  } = req.body

  let vectorStore = await ifCollectionExist(await sanitize(collection))
  
  if (!vectorStore) { 
    console.info(`Collection ${collection} does not exist.`)
    res.status(400).json({ success: false, message: `${collection} does not exist` })
    return
  }

  try {
    const llm = new ChatOpenAI({
      modelName: model,
      concurrency: 15,
      //maxConcurrency: 5,
      //timeout: 10000,
      streaming,
      cache,
      temperature: temperature,
      maxTokens: max_tokens,
    })
      
    const prompt =
      ChatPromptTemplate.fromTemplate(`Answer the following question based only on the provided context:
        <context>
        {context}
        </context>

        Question: {input}`);

    const retriever = vectorStore.asRetriever(k);

    const combineDocsChain = await createStuffDocumentsChain({
      llm,
      prompt
    });

    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain,
    });

    const response = await retrievalChain.invoke({ input: question });

    // Get the sources from the response
    let sources = response.context
    sources = sources.map((sources) => sources.metadata.source)
    // Remove duplicates
    sources = [...new Set(sources)]
    console.info('Sources:', sources)
    vectorStore = null
    // Return the response to the user
    res.json({ response: response.answer, sources })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Error processing the request' })
  }
})

export default router 