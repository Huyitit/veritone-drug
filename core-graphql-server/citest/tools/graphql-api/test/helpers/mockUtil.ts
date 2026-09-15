import fs from 'fs';
import path from 'path';

const templatePath = path.resolve(__dirname, '../../../../../test/template/');

export function getMockEngineTemplate(engineId: string, type: string = 'reproc'): string | undefined {
  let template: string | undefined;
  const engineTemplateFilename = `engine.${engineId}.txt`;
  const engineTemplates = fs
    .readFileSync(path.resolve(templatePath, engineTemplateFilename), 'utf-8')
    .toString()
    .split('\n');

  if (engineTemplates && engineTemplates.length >= 3) {
    const jobTemplatePath = `${engineTemplates[0]}.${type}.txt`;
    const dagTemplatePath = `${engineTemplates[1]}.${type}.txt`;
    const taskTemplatePath = `${engineTemplates[2]}.txt`;
    const jobTemplateString = fs.readFileSync(path.resolve(templatePath, jobTemplatePath), 'utf-8');
    const dagTemplateString = fs.readFileSync(path.resolve(templatePath, dagTemplatePath), 'utf-8');
    const taskTemplateString = fs.readFileSync(path.resolve(templatePath, taskTemplatePath), 'utf-8');

    if (jobTemplateString) {
      template = jobTemplateString.replace('<DAG>', dagTemplateString).replace('<TASK>', taskTemplateString);
    }
  }

  return template;
}
