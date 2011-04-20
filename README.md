
What's happening:

  - A TemplateView with TextFieldSupport mixed in is being created in views/
  - It's not being added to the DOM
    - This may sound weird, but consider a paged application that doesn't render everything up front
  - Initially, TfsTest.someController.zomg is simply null and this is fine
  - in main(), we set TfsTest.someController.zomg to a different value
  - This fires into the view's binding, trying to set the input's value
    - This fails silently
  - Because a value for TextFieldSupport is idempotent, the Binding system checks the views value at some point
    - The view's value property has not actually taken the value from the controller's property, as the input didn't exist
    - The call to this.$('input').val() returns null, which means it fires an update back at the controller
  - It starts looping somewhere, I haven't been able to find it