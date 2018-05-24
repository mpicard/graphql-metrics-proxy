import * as express from 'express';
import * as http from 'http';
import * as https from 'https';
import * as request from 'request';

const port = process.env.PORT || 4000;
const app = express();

let Agent;
if (process.env.NODE_ENV === 'production') {
  Agent = https.Agent;
} else {
  Agent = http.Agent;
}

// create default request to the original graphQL server
const origin = request.defaults({
  baseUrl: 'http://localhost:5000/',
  agent: new Agent({ keepAlive: true })
});

// create default request to api server
const baseUrl = process.env.METRICS_API_URI || 'http://localhost:8000/api/';
const api = request.defaults({
  baseUrl, agent: new Agent({ keepAlive: true })
});

// catch all /graphql requests with json body parser
app.use('/graphql', express.json(), (req, res, next) => {
  // we'll save the query string and (optional) operationName
  // build a similar request to the incoming request
  let query, operationName;

  if (req.method === 'POST') {
    query = req.body.query;
    operationName = req.body.operationName;
  } else if (req.method === 'GET') {
    query = req.query.query;
    operationName = req.query.operationName;
  }

  const options = {
    uri: req.originalUrl,
    method: req.method,
    headers: req.headers,
    json: req.body
  };
  origin(options, (err, queryRes, body) => {
    // relay status code
    res.status(queryRes.statusCode);

    if (queryRes.statusCode > 400) {
      // relay error message
      res.send(body).end();
    } else {
      // now we have the GraphQL response with the extensions metrics
      const { data, errors, extensions } = body;

      // send back response to client with data and/or errors
      res.json({ data, errors });

      if (query) collectMetrics(query, operationName, extensions, errors);
    }
  });
});

// pipe all other requests (like graphiql) to original
app.all('*', (req, res) => {
  const options = { uri: req.path, qs: req.query };
  req
    .pipe(origin(options))
    .pipe(res);
});

app.listen(port, () => {
  console.log('Proxy started http://localhost:4000/graphiql');
});

/**
 * Collect query metadata to metrics api.
 *
 * @param query GraphQL query string.
 * @param operationName (optional)
 * @param extensions object with tracing and/or caching metadata
 * @param errors array of Graphql errors
 */
function collectMetrics(query, operationName, extensions, errors) {
  // clean up query to remove sensitive data from parameters
  query = query.replace(/(\:.*?)(?=\,)|(\:.*?)(?=\))/g, '');
  // remove redundant whitespace
  query = query.replace(/\s+/g, ' ').trim();

  const options = {
    url: '/metrics',
    method: 'POST',
    json: { query, operationName, extensions, errors }
  };
  api(options, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      console.log('Proxy: POST error:', err.message || body);
    }
  });
}
