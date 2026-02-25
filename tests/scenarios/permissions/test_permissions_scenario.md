## Scenario: Permissions are enforced for friendlymail commands


Step: A non-host user sends an adduser command.
Result: friendlymail replies with a permission denied error.


Step: The host sends an invite command before creating a user account.
Result: friendlymail replies with a fatal error requiring a user account.


Step: The host sends a second adduser command after an account already exists.
Result: friendlymail replies with a fatal error that a user already exists.


Step: A non-host user sends an invite --addfollower message to the host user.
Result: friendlymail replies with a permission denied error.


Step: A non-host, non-follower user sends a follow --show message to the host user.
Result: friendlymail does not process the message, and does not respond.


Step: A non-host, non-follower user sends a create like message to the host user.
Result: friendlymail does not process the message, does not create a like, and does not respond.


Step: A non-host, non-follower user sends a create comment message to the host user.
Result: friendlymail does not process the message, does not create a comment, and does not respond.


Step: A non-host user sends an unfollow message to the host user, with a third party address as the parameter.
Result: friendlymail replies with a permission denied error.


Step: A non-host user sends a follow message to the host user, with a third party address as the parameter.
Result: friendlymail replies with a permission denied error.


Step: A non-host user sends a create post message to the host user.
Result: friendlymail does not process the message, does not create a post, and does not respond.
