import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFile(dir + name, 'utf8');
let [html,css,model,app] = await Promise.all(['index.html','style.css','model.js','app.js'].map(read));
html = html.replace('<link rel="stylesheet" href="./style.css" />',()=>'<style>\n'+css+'\n</style>')
  .replace('<script src="../script/config.js"></script>','<script>window.SALA_CONFIG = <?!= configJson ?>;</script>')
  .replace('<script src="./model.js"></script>',()=>'<script>\n'+model+'\n</script>')
  .replace('<script src="./app.js"></script>',()=>'<script>\n'+app+'\n</script>');
await writeFile(dir+'apps-script/Index.html',html);
await writeFile(dir+'apps-script/Model.gs',model);
await writeFile(dir+'../backend/public/Model.gs',model);
console.log('Generados apps-script/Index.html y Model.gs.');
