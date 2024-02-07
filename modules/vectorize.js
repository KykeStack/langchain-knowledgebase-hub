import { getUrlFilename, fetchAndSaveFile, deleteFile } from '../modules/global.js'
import openSearchClient from '../clients/openSearchClient.js'

import { basename } from 'path'
import { OpenSearchVectorStore } from '@langchain/community/vectorstores/opensearch'

/* Open AI | LLM*/
import { OpenAIEmbeddings } from '@langchain/openai'

/* Parsers */
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { UnstructuredLoader } from 'langchain/document_loaders/fs/unstructured'
import { TextLoader } from "langchain/document_loaders/fs/text";

/* Tools */
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import SitemapXMLParser from 'sitemap-xml-parser'
import { CheerioWebBaseLoader } from 'langchain/document_loaders/web/cheerio'

/* Load environment variables from .env file */
import * as dotenv from 'dotenv'

const dotenvConfig = dotenv.config()

const splitAndCleanDocuments = async (docs, chunkSize, chunkOverlap) => {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\\n\\n", "\n\n", ".\\n", ".\n", "\\n", "\n", " ", ""]
  });

  return await textSplitter.splitDocuments(docs);
};

/* Function for the sitemap parser */
async function parseSitmap(url, filter, limit) {
  const options = {
    delay: 4000,
    limit: 5,
  }

  const sitemapXMLParser = new SitemapXMLParser(url, options)

  return sitemapXMLParser.fetch().then((result) => {
    let list = result
      .map((item) => item.loc[0].trim().replace(/\r\n/g, ' '))
      .filter((item) => !filter || item.includes(filter))
    return limit ? list.slice(0, limit) : list
  })
}

const addDocumentsToCollection = async (documents, collection, callback) => {
  /* Clean metadata for OpenSearch */
  documents.forEach(callback)

  let vectorStore = await OpenSearchVectorStore.fromDocuments(documents, new OpenAIEmbeddings(), {
    client: openSearchClient,
    indexName: collection, // Will default to `documents`
  });

  vectorStore = null; // Assuming this is intended to be nullified.
  console.info('Added!');
};


/* Using Cheerio to parse HTML from the URL */
async function addURL(url, collection, chunkSize = 500, chunkOverlap = 200) {
  const loader = new CheerioWebBaseLoader(url)
  const docs = await loader.load()

  const documents = await splitAndCleanDocuments(docs, chunkSize, chunkOverlap)

  if (documents.length === 0) return false

  await addDocumentsToCollection(documents, collection, (document) => {
    delete document.metadata.loc
  })

  return true
}

/**
 * Checks if a vector collection with the specified encoded name exists in the OpenSearch index.
 *
 * @param {string} encodedCollection - The encoded name of the vector collection.
 * @returns {Promise<OpenSearchVectorStore|null>} - A Promise that resolves to the OpenSearchVectorStore instance
 *                                                if the collection exists; otherwise, resolves to null.
 * @throws {Error} - If there is an error during the process, an error is thrown with a descriptive message.
 */
export const ifCollectionExist = async (encodedCollection) => {
  let vectorStore
  try {
    vectorStore = new OpenSearchVectorStore(new OpenAIEmbeddings(), {
      client: openSearchClient,
      indexName: encodedCollection, // Will default to `documents`
    });

    const indexExist = await vectorStore.doesIndexExist()

    if (!indexExist) { 
      vectorStore = null
      return null
    }

    return vectorStore
  } catch (err) {
    console.error(err)
    vectorStore = null
    res.status(500).json({ message: 'Error processing the request' })
    return null
  }
}

export const handleUrlOrHtml = async (url, collection, chunkSize, chunkOverlap, res) => {
  try {
    const state = await addURL(url, collection, chunkSize, chunkOverlap);
    if (!state) {
      res.status(404).json({ message: `No data found for ${url}` });
      return;
    }
    res.json({ response: 'added', collection: collection });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing the request' });
  }
};

export const handleSitemap = async (url, collection, chunkSize, chunkOverlap, filter, limit, res) => {
  try {
    const sitemap = await parseSitmap(url, filter, limit);
    await Promise.all(sitemap.map((item) => addURL(item, collection, chunkSize, chunkOverlap)));
    res.json({ response: 'started', collection: collection });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing the sitemap' });
  }
};

export const handlePdf = async (url, collection, chunkSize, chunkOverlap, downloadDir, res) => {
  try {
    const filename = await getUrlFilename(url);
    if (!filename) {
      res.status(400).json({ message: 'The provided URL is not a PDF file.' });
      return;
    }

    const filePath = await fetchAndSaveFile(url, filename, downloadDir);
    const loader = new PDFLoader(filePath, { splitPages: true });
    const docs = await loader.load();
    const documents = await splitAndCleanDocuments(docs, chunkSize, chunkOverlap);

    if (documents.length === 0) {
      res.status(404).json({ message: `No data found for ${url}` })
      return
    }

    await addDocumentsToCollection(documents, collection, (document) => {
      document.metadata.source = basename(document.metadata.source)
      delete document.metadata.pdf
      delete document.metadata.loc
    });

    deleteFile(filePath)

    res.json({ response: 'added', collection: collection });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing the PDF' });
  }
};


export const handleUnstructured = async (url, collection, chunkSize, chunkOverlap, downloadDir, res) => {
  try {
    const filename = await getUrlFilename(url);
    if (!filename) {
      res.status(400).json({ message: 'The provided URL is not a file URL.' });
      return;
    }

    const filePath = await fetchAndSaveFile(url, filename, downloadDir);
    const loader = new UnstructuredLoader(`${process.env.UNSTRUCTURED_URL}/general/v0/general`, filePath);
    const docs = await loader.load();
    const documents = await splitAndCleanDocuments(docs, chunkSize, chunkOverlap);

    if (documents.length === 0) {
      res.status(404).json({ message: `No data found for ${url}` })
      return
    }

    await addDocumentsToCollection(documents, collection, (document) => {
      document.metadata.source = document.metadata.filename // Once is clear how retrival works, keep the metadata filename
      delete document.metadata.filename
      delete document.metadata.category
      delete document.metadata.loc
    });

    deleteFile(filePath)

    res.json({ response: 'added', collection: collection });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing the file.' });
  }
};