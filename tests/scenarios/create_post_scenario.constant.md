Scenario: A friendlymail account is created and a post is made

Step: friendlymail is attached to a host.
Result: A Welcome Message is sent.

Step: The host sends a help command.
Result: friendlymail replies to the help command.

Step: The host sends a create account command.
Result: friendlymail replies and creates an account.

Step: The host user sends an invite command with the addfollower parameter.
Result: The address is added as a follower of the host user.

Step: The user sends a create post message containing the text "Hello, world" as the post.
Result: The user is notified via a New Post notification message. The follower is notified via a New Post notification message.

Step: The follower likes the post by sending a create like message.
Result: The user is notified via a New Like notification message.

Step: The follower comments on the post by sending a create comment message.
Result: The user is notified via a New Comment notification message.
