module.exports = function create(directiveContext) {
  const logger = directiveContext.logger;

  return {
    name: 'audit',
    before: true,
    resolver(directiveArgs, fieldArgs, context, info) {
      const objectType = directiveArgs.objectType;
      const action = directiveArgs.action;
      if (objectType) fieldArgs._audit_objectType = objectType;
      if (action) fieldArgs._audit_action = action;
    },
    validator(directiveArgs, field) {
      /* these are in enum
      const action = directiveArgs.action;
      if (action && !(action === 'Create' || action === 'Update' || action === 'Delete')) {
        throw new Error('valid Audit.action values for '+field.type+'.'+field.name+' are Create, Update, or Delete. Not '+action);
      }*/
    }
  };
};
