/*globals TfsTest */

TfsTest.TextField = SC.TemplateView.create(SC.TextFieldSupport, {
  valueBinding: 'TfsTest.someController.zomg'
});; if ((typeof SC !== 'undefined') && SC && SC.Module && SC.Module.scriptDidLoad) SC.Module.scriptDidLoad('tfs_test');