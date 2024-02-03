import { PlaywrightWebBaseLoader } from "./PlwgtWeb.js";
import { RecursiveCharacterTextSplitter } from "./HtmlToSplit.js";
import { HtmlToTextTransformer } from "@langchain/community/document_transformers/html_to_text";

/**
 * Class representing a document loader for web pages using Playwright.
 * @param {string} url - The URL of the web page to load.
 * @param {Array<string>} [evaluators = defaultEvaluators] - List of selectors to remove from the page.
 */
export class PlwgtWebLoader {
  constructor(url, evaluators = ["footer", "head", "style", "script", "link"]) {
    this.url = url;
    this.evaluators = evaluators;
  }

  /**
   * Load and evaluate the web page.
   * @returns {Promise<string>} - The loaded and evaluated page content.
   */
  async load() {
    const evaluators = this.evaluators
    const loader = new PlaywrightWebBaseLoader(this.url, {
      /**
       * Evaluate the page content and remove specified elements.
       * @param {Page} page - The Playwright Page object.
       * @param {Browser} browser - The Playwright Browser object.
       * @param {Response} response - The Playwright Response object.
       * @returns {Promise<string>} - The evaluated page content.
       */
      async evaluate(page, browser, response) {
        for (const selector of evaluators) {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            if (await element.isVisible()) {
              await element.evaluate((element) => element.remove());
            }
          }
        }
        const pageSource = await page.content();
        return pageSource;
      }
    });
    return loader.load();
  }

    
  /**
   * Function to load a webpage, remove specified elements, and transform the content.
   * @returns {Promise<DocumentInterface<Record<string, any>>[]>} - The transformed content of the webpage.
   */
  async loadAndTransform() {
    try {
      // Load the webpage and apply the evaluate function.
      const docs = await this.load();

      // Create a RecursiveCharacterTextSplitter instance with the specified separators.
      const splitter = RecursiveCharacterTextSplitter.fromHtml();
      
      // Create an HtmlToTextTransformer instance.
      const transformer = new HtmlToTextTransformer();

      // Pipe the splitter and transformer to create a processing sequence.
      const sequence = splitter.pipe(transformer);

      // Invoke the processing sequence on the loaded documents.
      const newDocuments = await sequence.invoke(docs);

      return newDocuments;
    } catch (error) {
      console.error("Error loading and transforming:", error);
      throw error;
    }
  }
}

