import { login, getRootFolders } from './graphqlUtil';

(async function main() {
  try {
    const token = await login('sminkov+playpen@veritone.com', 'Batman123!');
    console.log(token);
    const folders = await getRootFolders();
    for(const folder of folders) {
      console.dir(folder);
    }
  } catch (error) {
    console.error('Error login:', error);
  }
})();
