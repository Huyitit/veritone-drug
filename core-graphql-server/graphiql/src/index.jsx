import 'regenerator-runtime/runtime.js';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { GraphiQL } from 'graphiql';
import { explorerPlugin } from '@graphiql/plugin-explorer';
import { getSnippets } from './snippets';
import { codeExporterPlugin } from '@graphiql/plugin-code-exporter';
import 'graphiql/graphiql.css';
import '@graphiql/plugin-explorer/dist/style.css';
import '@graphiql/plugin-code-exporter/dist/style.css';
import { createGraphiQLFetcher } from '@graphiql/toolkit';
import { useStorageContext } from '@graphiql/react';
import { SubscriptionClient } from 'subscriptions-transport-ws';

import './index.css';
import { serverSelectPlugin } from './select-server-plugin';
import {
  LAST_URL_KEY,
  DEFAULT_QUERY,
  URL_PLACEHOLDERS
} from './constants';

if ('serviceWorker' in navigator) {
  let currentUrl = window.location.href.replace('graphiql', 'graphql');
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(currentUrl + '/public/service-worker.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

const style = { height: '100vh' };
/**
 * instantiate outside of the component lifecycle
 * unless you need to pass it dynamic values from your react app,
 * then use the `useMemo` hook
 */
const explorer = explorerPlugin();

const customStorageAPI = ({ componentId }) => ({
  setItem: (key, value) => localStorage.setItem(`${componentId}~${key}`, value),
  getItem: (key) => localStorage.getItem(`${componentId}~${key}`),
  removeItem: (key) => localStorage.removeItem(`${componentId}~${key}`),
  length: localStorage.getItem(`${componentId}~graphiql:queries`)?.length ?? 0,
  key: (index) => localStorage.key(index),
  clear: () => localStorage.clear()
});

const App = () => {
  const storage = useStorageContext();

  const lastUrl = storage?.get(LAST_URL_KEY);
  const [currentUrl, setUrl] = React.useState(lastUrl);
  const [theme, setTheme] = React.useState();

  const exporter = React.useMemo(
    () =>
      codeExporterPlugin({ snippets: getSnippets({ serverUrl: currentUrl }) }),
    [currentUrl]
  );
  const fetcher = React.useMemo(() => {
    let subscriptionUrl = currentUrl
      ? currentUrl.replace('http', 'ws')
      : undefined;

    return createGraphiQLFetcher({
      url: currentUrl,
      legacyWsClient: subscriptionUrl
        ? new SubscriptionClient(subscriptionUrl, {
            connectionParams: { __graphiqlBuiltIn: true }
          })
        : undefined
    });
  }, [currentUrl]);
  const serverSelect = React.useMemo(
    () => serverSelectPlugin({ url: currentUrl, setUrl }),
    [currentUrl]
  );

  React.useEffect(() => {
    const settingsDOM = document.getElementById('settings');
    setTheme(settingsDOM.getAttribute('data-theme'));

    const urlPlaceholdersDOM = document.getElementById('urlPlaceholders');
    const setFnMapping = {
      url: setUrl
    };

    Object.keys(URL_PLACEHOLDERS).forEach((key) => {
      if (typeof setFnMapping[key] === 'function') {
        const endpointData = urlPlaceholdersDOM.getAttribute(`data-${key}`);
        if (endpointData !== URL_PLACEHOLDERS[key]) {
          setFnMapping[key](endpointData);
        }
      }
    });
  }, []);

  if (!currentUrl) {
    return (
      <div className="loader-container">
        <div className="loader">
          <div className="inner-circle"></div>
        </div>
      </div>
    );
  }

  return (
    <GraphiQL
      storage={customStorageAPI({
        componentId: currentUrl
      })}
      forcedTheme={theme}
      defaultQuery={DEFAULT_QUERY}
      style={style}
      plugins={[serverSelect, explorer, exporter]}
      fetcher={fetcher}
      shouldPersistHeaders
    />
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
