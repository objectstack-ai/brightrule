// The permissions in this directory. `objectstack generate permission NAME` writes one
// here and adds its export line below. objectstack.config.ts hands every
// export of this file to the stack, so a permission exported here is part of it,
// and a permission file this index does not export is never loaded.
// The capabilities these sets grant are declared apart, in ./capabilities.ts.
export {};
export { PolicyAdminPermissionSet } from './policy-admin.permission.js';
export { InquirerPermissionSet } from './inquirer.permission.js';
