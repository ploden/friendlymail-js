Scenario: A friendlymail account is created and a post is made

Step: friendlymail is attached to a host.
Result: A Welcome Message is sent:
```
From: Phil L <phil@test.com>
Subject: Welcome to friendlymail!
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"welcome"}

   __      _                _ _                       _ _
  / _|    (_)              | | |                     (_) |
 | |_ _ __ _  ___ _ __   __| | |_   _ _ __ ___   __ _ _| |
 |  _| '__| |/ _ \ '_ \ / _` | | | | | '_ ` _ \ / _` | | |
 | | | |  | |  __/ | | | (_| | | |_| | | | | | | (_| | | |
 |_| |_|  |_|\___|_| |_|\__,_|_|\__, |_| |_| |_|\__,_|_|_|
                                 __/ |
                                |___/
friendlymail 0.0.1
Reply to this message with "$ help" for more information.

help: mailto:phil@test.com?subject=Fm&body=%24%20help

friendlymail, an open-source, email-based, alternative social network
```


Step: The host sends a help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ help

```

Result: friendlymail replies to the help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"help"}

$ help
friendlymail: friendlymail, version 0.0.1
These shell commands are defined internally.  Type `$ help' to see this list.
Type `$ help adduser' to find out more about the function `adduser'.

$ help: mailto:phil@test.com?subject=Fm&body=%24%20help
$ adduser: mailto:phil@test.com?subject=Fm&body=%24%20adduser
$ help adduser: mailto:phil@test.com?subject=Fm&body=%24%20help%20adduser
$ invite: mailto:phil@test.com?subject=Fm&body=%24%20invite
$ help invite: mailto:phil@test.com?subject=Fm&body=%24%20help%20invite
$ follow: mailto:phil@test.com?subject=Fm&body=%24%20follow
$ help follow: mailto:phil@test.com?subject=Fm&body=%24%20help%20follow

friendlymail, an open-source, email-based, alternative social network

```


Step: The host sends a create account command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Result: friendlymail replies and creates an account:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"adduser_response"}

$ adduser
Adding friendlymail user with name `Phil L' and email `phil@test.com' ...
Done.

To create your first post, reply to this message, or open the link below.

Create post: mailto:phil@test.com?subject=Fm&body=Hello%2C+world

friendlymail, an open-source, email-based, alternative social network

```


Step: The host user sends an invite command with the addfollower parameter:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite --addfollower kath@test.com

```

Result: The address is added as a follower of the host user. friendlymail replies with the following message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"invite"}

$ invite --addfollower kath@test.com
invite: kath@test.com is now following you.

friendlymail, an open-source, email-based, alternative social network

```


Step: The user sends a create post message containing the text "Hello, world" as the post:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
Message-Id: <74206DB7-D586-4F7D-A203-5C5E1DAE7112@gmail.com>

Hello, world

```

Result: Message sent to host user (phil@test.com):
```
From: Phil L <phil@test.com>
Subject: friendlymail: New post from Phil L
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"new_post_notification"}

Phil L --> posted:

"Hello, world"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

friendlymail, an open-source, email-based, alternative social network

```

Result: Message sent to follower (kath@test.com):
```
From: Phil L <phil@test.com>
Subject: friendlymail: New post from Phil L
To: Kath L <kath@test.com>
X-friendlymail: {"messageType":"new_post_notification"}

Phil L --> posted:

"Hello, world"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

friendlymail, an open-source, email-based, alternative social network

```


Step: The follower likes the post by sending a create like message:
```
From: Kath L <kath@test.com>
Subject: Fm Like ❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+
To: Phil L <phil@test.com>

❤️

```

Result: The user is notified via a New Like notification message.
```
From: Phil L <phil@test.com>
Subject: friendlymail: Kath L liked your post...
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"new_like_notification"}

Kath L --> liked your post.

Phil L:
"Hello, world"

Kath L:
"❤️"

friendlymail, an open-source, email-based, alternative social network

```


Step: The follower comments on the post by sending a create comment message:
```
From: Kath L <kath@test.com>
Subject: Fm Comment 💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+
To: Phil L <phil@test.com>

hello, universe!

```

Result: The user is notified via a New Comment notification message:
```
From: Phil L <phil@test.com>
Subject: friendlymail: New comment from Kath L
To: Phil L <phil@test.com>
X-friendlymail: {"messageType":"new_comment_notification"}

Kath L --> commented on your post:

"hello, universe!"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

Comment thread:

Phil L:
"Hello, world"

Kath L:
"hello, universe!"

friendlymail, an open-source, email-based, alternative social network

```
