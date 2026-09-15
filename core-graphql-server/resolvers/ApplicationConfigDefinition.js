module.exports = function createFunction(serviceContext) {
  return {
    createdBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.createdBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    modifiedBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.modifiedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    }
  };
};
