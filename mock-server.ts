import { graphiqlExpress, graphqlExpress } from 'apollo-server-express';
import { spawn } from 'child_process';
import * as express from 'express';
import { readFileSync } from 'fs';
import { addMockFunctionsToSchema, makeExecutableSchema } from 'graphql-tools';

const typeDefs = readFileSync(__dirname + '/schema.graphql', 'utf8');
const schema = makeExecutableSchema({ typeDefs });
addMockFunctionsToSchema({ schema });

const app = express();

// Start proxy server
const proxy = spawn('ts-node', ['-r', 'dotenv/config', __dirname + '/proxy.ts']);
proxy.stdout.pipe(process.stdout);
proxy.stderr.pipe(process.stderr);

// Setup regular apollo middleware
app.use('/graphql', express.json(), graphqlExpress({
  schema,
  // tracing enables the performance metrics we'll collect
  // with the proxy to create a dashboard
  tracing: true,
}));

app.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql'
}));

app.listen(5000, () => {
  console.log(`GraphQL started http://localhost:5000/graphiql`);
});

process.on('exit', () => proxy.kill());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
