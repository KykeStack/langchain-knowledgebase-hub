import axios from 'axios'
import * as fs from 'fs/promises'
import openSearchClient from '../clients/openSearchClient.js'

import { createWriteStream } from 'fs'
import { parse as parseUrl } from 'url'
import { join, extname, basename } from 'path'
import { OpenSearchVectorStore } from '@langchain/community/vectorstores/opensearch'

/* Open AI | LLM */
import { OpenAIEmbeddings } from '@langchain/openai'

/* Parsers */
import { CheerioWebBaseLoader } from 'langchain/document_loaders/web/cheerio'
import SitemapXMLParser from 'sitemap-xml-parser'

/* Tools */
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

function cleanFilePath(filePath) {
  // Define a regular expression that matches all non-alphanumeric characters and hyphens
  const regex = /[^a-zA-Z0-9\-]/g
  // Replace all non-matching characters with an empty string
  const cleanedFilePath = filePath.replace(regex, '')
  return cleanedFilePath
}

/* Clean the text by removing newlines in the beginning of the string */
function cleanText(text) {
  const regex = /^[\n]+/
  const cleanedText = text.replace(regex, '')
  return cleanedText
}

/* Sanitize the collection name for OpenSearch */
async function sanitize(collection) {
  /* OpenSearch */
  const sanitized = collection
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/ /g, '-')
  return sanitized
}

/* Extract the filename from the URL if exist */
async function getUrlFilename(url) {
  const parsedUrl = parseUrl(url)
  const pathname = parsedUrl.pathname
  const extension = extname(pathname)

  if (extension) {
    return basename(pathname)
  }

  return null
}

/* Get the file type from the URL */
async function getFileType(url) {
  const unstructuredApiFiletypes = [".txt", ".text", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".eml", ".html", ".htm", ".md", ".pptx", ".ppt", ".msg", ".rtf", ".xlsx", ".xls", ".odt", ".epub"]
  const isValidUnstructured = unstructuredApiFiletypes.filter(extension => new RegExp(`\\${extension}$`, 'i').test(url));
  if (isValidUnstructured.length > 0) return 'UNSTRUCTURED'

  const fileTypes = [
    { regex: /sitemap\.xml$/i, type: 'SITEMAP' },
    { regex: /\.pdf$/i, type: 'PDF' },
  ];

  for (const fileType of fileTypes) {
    if (url.match(fileType.regex)) {
      return fileType.type;
    }
  }

  return 'URL'
}

/* Download a file before adding to OpenSearch */
async function fetchAndSaveFile(url, filename, downloadDir) {
  /* Ensure the directory exists */
  try {
    await fs.access(downloadDir)
  } catch {
    await fs.mkdir(downloadDir)
  }

  const outputPath = join(downloadDir, filename)

  const response = await axios.get(url, {
    responseType: 'stream',
  })

  const writer = createWriteStream(outputPath)

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(outputPath))
    writer.on('error', (err) => reject(err))
  })
}

async function deleteFile(filepath) {
  fs.unlink(filepath, (err) => {
    if (err) {
      console.error(err);
    } else {
      console.info('File is deleted.');
    }
  });
}


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

/* Using Cheerio to parse HTML from the URL */
async function addURL(url, encodedCollection, chunkSize, chunkOverlap) {
  let loader = new CheerioWebBaseLoader(url)
  let docs = await loader.load()

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkSize || 500,
    chunkOverlap: chunkOverlap || 100,
    separators: ["\\n\\n", "\n\n", ".\\n", ".\n", "\\n", "\n", " ", ""]
  })

  const docOutput = await textSplitter.splitDocuments(docs)

  if (docOutput.length === 0) return false

  /* Clean metadata for OpenSearch */
  docOutput.forEach((document) => {
    delete document.metadata.loc
  })

  let vectorStore = await OpenSearchVectorStore.fromDocuments(docOutput, new OpenAIEmbeddings(), {
    client: openSearchClient,
    indexName: encodedCollection, // Will default to `documents`
  });

  vectorStore = null
  return true
}

export {
  cleanFilePath, 
  cleanText, 
  sanitize, 
  getUrlFilename, 
  getFileType, 
  fetchAndSaveFile, 
  deleteFile,
  parseSitmap,
  addURL 
}