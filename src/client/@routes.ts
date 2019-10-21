import {
  RootRouteMatchType,
  Router as BoringRouter,
  schema,
} from 'boring-router';
import {BrowserHistory} from 'boring-router-react';

export const workspaceRouteSchema = schema({
  home: {
    $match: '',
  },
  create: {
    $query: {
      template: true,
      params: true,
      autoCreate: true,
    },
  },
});

export type WorkspaceRoute = RootRouteMatchType<
  typeof workspaceRouteSchema,
  undefined,
  string
>;

let history = new BrowserHistory();
let router = new BoringRouter(history);

export const route = router.$route(workspaceRouteSchema);
