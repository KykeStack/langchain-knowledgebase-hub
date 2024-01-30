import swaggerAutogen from 'swagger-autogen';

const outputFile = './swagger_output.json'
const endpointsFiles = ['./routes/*.js', './app.js']

swaggerAutogen(outputFile, endpointsFiles)
