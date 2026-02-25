## Scenario: Permissions are enforced for friendlymail commands


Step: A non-host user sends an adduser command.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```
Result: friendlymail replies with a permission denied error.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>
X-friendlymail: {"messageType":"adduser_response"}

$ adduser
adduser: Permission denied

friendlymail, an open-source, email-based, alternative social network

```


Step: The host sends an invite command before creating a user account.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kath@test.com

```
Result: friendlymail replies with a fatal error requiring a user account.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"invite"}

$ invite kath@test.com
invite: Fatal: a friendlymail user account is required for this command.

friendlymail, an open-source, email-based, alternative social network

```


Step: The host sends a second adduser command after an account already exists.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```
Result: friendlymail replies with a fatal error that a user already exists.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"adduser_response"}

$ adduser
adduser: Fatal: a friendlymail user already exists for phil@test.com

friendlymail, an open-source, email-based, alternative social network

```


Step: A non-host user sends an invite --addfollower message to the host user.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite --addfollower dave@test.com

```
Result: friendlymail replies with a permission denied error.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>
X-friendlymail: {"messageType":"invite"}

$ invite --addfollower dave@test.com
invite: Permission denied

friendlymail, an open-source, email-based, alternative social network

```


Step: A non-host, non-follower user sends a follow --show message to the host user.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ follow --show

```
Result: friendlymail does not process the message, and does not respond.


Step: A non-host, non-follower user sends a create like message to the host user.
```
From: Kath L <kath@test.com>
Subject: Fm Like ❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+
To: Phil L <phil@test.com>

❤️

```
Result: friendlymail does not process the message, does not create a like, and does not respond.


Step: A non-host, non-follower user sends a create comment message to the host user.
```
From: Kath L <kath@test.com>
Subject: Fm Comment 💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+
To: Phil L <phil@test.com>

hello, universe!

```
Result: friendlymail does not process the message, does not create a comment, and does not respond.


Step: A non-host user sends an unfollow message to the host user, with a third party address as the parameter.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ unfollow dave@test.com

```
Result: friendlymail replies with a permission denied error.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>
X-friendlymail: {"messageType":"unfollow_response"}

$ unfollow dave@test.com
unfollow: Permission denied

friendlymail, an open-source, email-based, alternative social network

```


Step: A non-host user sends a follow message to the host user, with a third party address as the parameter.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ follow dave@test.com

```
Result: friendlymail replies with a permission denied error.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>
X-friendlymail: {"messageType":"follow_response"}

$ follow dave@test.com
follow: Permission denied

friendlymail, an open-source, email-based, alternative social network

```


Step: A non-host user sends a create post message to the host user.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

hello, world

```
Result: friendlymail does not process the message, does not create a post, and does not respond.
