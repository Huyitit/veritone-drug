module.exports = function () {
  const fs = require('fs');
  const express = require('express');
  const _ = require('lodash');
  const mainUtil = require('./util')();
  const fsPromises = fs.promises;
  const accepts = require('accepts');
  const {
    renderPlaygroundPage
  } = require('@apollographql/graphql-playground-html');

  async function applyMiddleware({ app, path, playground }) {
    const filePath = _.get(playground, 'filePath');
    const templateFilePath = _.get(playground, 'templateFilePath');
    if (
      _.isNil(app) ||
      _.isNil(path) ||
      _.isNil(filePath) ||
      _.isNil(templateFilePath)
    ) {
      return;
    }

    try {
      // Each path should have static HTML that had replaced all handlebars.
      // If the file has not already been processed, it should be.
      const fileExist = fs.existsSync(filePath);
      if (!fileExist) {
        // obtain html content from template file
        let htmlBuffer = await fsPromises.readFile(templateFilePath);
        const settings = _.get(playground, 'settings', {});
        const replacing = {
          '{{PLAYGROUND_ENDPOINT}}': _.get(playground, 'endpoint'),
          '{{THEME}}': settings['editor.theme']
        };
        _.forEach(replacing, (v, handlebar) => {
          if (v) {
            htmlBuffer = mainUtil.replaceBuffer(htmlBuffer, handlebar, v);
          }
        });

        // after replacing handlebars, store a new file
        await fsPromises.writeFile(filePath, htmlBuffer);
      }

      app.use(path, express.static(filePath));
    } catch (error) {
      app.logger.error(
        `customPlayground: cannot override graphql-playground due to unable to process the static html file for path: ${path}.`
      );
    }

    return;
  }

  function withBanner({ app, path, playground, banner }) {
    if (
      _.isNil(app) ||
      _.isNil(path) ||
      _.isEmpty(banner) ||
      _.isEmpty(playground)
    ) {
      return;
    }
    const bannerHtml = _renderBannerHtml(banner);
    // These codes are copied from the applyMiddleware function of apollo-server-express;
    // override the apollo-server-express GET request when request accept is text/html;
    // and just add banner html to the playground html.
    app.get(path, (req, res, next) => {
      const accept = accepts(req);
      const types = accept.types();
      const prefersHTML =
        types.find((x) => x === 'text/html' || x === 'application/json') ===
        'text/html';

      if (prefersHTML) {
        const playgroundRenderPageOptions = {
          endpoint: req.originalUrl,
          ...playground
        };
        res.setHeader('Content-Type', 'text/html');
        let htmlString = renderPlaygroundPage(playgroundRenderPageOptions);
        const indexPosition = htmlString.indexOf('<body>');
        htmlString =
          htmlString.slice(0, indexPosition) +
          bannerHtml +
          htmlString.slice(indexPosition);

        res.write(htmlString);
        res.end();
        return;
      }

      // call next() to go on to the apollo-server-express GET request.
      next();
    });
  }

  function _renderBannerHtml(bannerOptions) {
    const messages = _.get(bannerOptions, 'messages', []);

    if (_.isEmpty(messages)) {
      return '';
    }

    let bannerHtml = `<div style="width:100%;height:5%;background:#f18f01;display:flex;justify-content:center;align-items:center;">`;

    _.forEach(messages, ({ text, link, linkText }) => {
      bannerHtml += `<div><span style="margin-left:5px">${text}</span>`;

      if (link) {
        bannerHtml += `<a href="${link}" target="_blank" style={{color:inherit}}>${
          linkText || link
        }</a>`;
      }
      bannerHtml += '</div>';
    });
    bannerHtml += '</div>';

    return bannerHtml;
  }

  return {
    applyMiddleware,
    withBanner
  };
};
