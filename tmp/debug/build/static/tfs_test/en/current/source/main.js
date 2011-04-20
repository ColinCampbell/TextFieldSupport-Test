// ==========================================================================
// Project:   TfsTest
// Copyright: ©2011 My Company, Inc.
// ==========================================================================
/*globals TfsTest */

// This is the function that will start your app running.  The default
// implementation will load any fixtures you have created then instantiate
// your controllers and awake the elements on your page.
//
// As you develop your application you will probably want to override this.
// See comments for some pointers on what to do next.
//
TfsTest.main = function main() {

  TfsTest.getPath('mainPage.mainPane').append() ;

  TfsTest.someController.set('content', {
    zomg: 'hi'
  });

} ;

function main() { TfsTest.main(); }
; if ((typeof SC !== 'undefined') && SC && SC.Module && SC.Module.scriptDidLoad) SC.Module.scriptDidLoad('tfs_test');