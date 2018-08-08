
Feature('Submit Signup Form');

// After(pause)

Scenario('Users should be able to signup', (I) => {
  I.amOnPage("/");
  I.fillField("First Name", "Test");
  I.fillField("Last Name", "Testerperson");
  I.fillField("Email", `jay+slack.invite.${Date.now()}@venuebook.com`);
  I.click(".signup-form__btn");
  I.waitForElement(".signup-confirm", 3);
});
