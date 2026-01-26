# friendlymail

friendlymail is an email-based social network. It supports the core features of a social network, such as posting, following, commenting, and liking, all implemented via email. The app is implemented in Typescript, and can then be integrated with an email client to send and receive messages.

# Table of Contents
- [Definitions](#definitions)
- [Message Types](#message-types)
  - [Welcome Message](##welcome-message)
  - [Command Messages](##command-messages)
    - [help](###help)
    - [adduser](###adduser)
    - [invite](###invite)
    - [follow](###follow)
    - [addfollower](###addfollower)
  - [Create Message](##create-message)
  - [Notification Messages](##notification-messages)
    - [New Post Notification](###new-post-notification)
    - [New Like Notification](###new-like-notification)
    - [New Comment Notification](###new-comment-notification)
    - [New Follower Notification](###new-follower-notification)
    - [New Follower Request Notification](###new-follower-request-notification)
    - [Now Following Notification](###new-following-notification)

# Definitions
- host: the email account used to send and receive friendlymail messages.
- user: a friendlymail user account for a particular friendlymail user. An account must be attached to a specific host. Commands such as help can be used without an account. Posting requires an account, however.
- friendlymail message: an email sent to or from friendlymail. An email received with the subject "Fm", "fm", or "📻" will be processed by friendlymail as a friendlymail message. Emails sent by friendlymail will contain the header X-friendlymail, which contains metadata for that message. The metadata is a json string.

# Message Types
friendly-mail supports the following types of messages:
- Welcome Message
- Command Message
- Create Message


## Welcome Message
The welcome message is sent when friendlymail is configured with a host. The welcome message briefly explains what friendlymail is, and informs the user that they can use the help command for more information. A welcome message should be sent once and only once to the host.

Example Welcome Message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

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

friendlymail, an open-source, email-based, alternative social network
```

## Command Messages
friendlymail supports commands, similar to a CLI. A command must be preceded by "$". Some commands are only supported when the sender is the host. Others are supported for any sender. For example, the "help" command may be used by any sender. The "adduser" command may only be used by the host. The following commands are supported.

friendly-mail supports the following types of command messages:
- [help](###help)
- adduser
- invite
- follow
- addfollower

### help
The help command provides information about friendlymail. When a message with subject "Fm" and body "$ help" is sent to the host, a help message should be sent in reply.

Example message containing the help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ help

```

Example message sent in reply to the above message containing the help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ help
friendlymail: friendlymail, version 0.0.1
These shell commands are defined internally.  Type `$ help' to see this list.
Type `$ help adduser' to find out more about the function `adduser'.

help
adduser
invite
follow

friendlymail, an open-source, email-based, alternative social network

```

### adduser
The adduser command is used to create a friendlymail user, which is required for posting.

Example message containing the adduser command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Example message sent in reply to the above message containing the adduser command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser
Adding friendlymail user with name `Phil L' and email `phil@test.com' ...
Done.

friendlymail, an open-source, email-based, alternative social network

```

The adduser command can only be used by the host. If an adduser command is received from an address other than the host, the command should not be executed. Here is an example message containing the adduser command from an address other than the host:
```
From: Kate L <kate@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Example message sent in reply to the above message containing the adduser command, where the sender does not match the host address:
```
From: Kate L <kate@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser
adduser: Permission denied

friendlymail, an open-source, email-based, alternative social network

```

The adduser command cannot be used more than once, and a friendlymail user has already been created for the current host. Here is an example message containing the adduser command when a user has already been created for this host:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Example message sent in reply to the above message containing the adduser command, where a user has already been created for this host:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser
adduser: Fatal: a user already exists for this host

friendlymail, an open-source, email-based, alternative social network

```

### invite
The invite command is used to invite someone to follow the host user. The invite command can only be used by the host user.

Here is an example of the invite command. The friendlymail user is using the host phil@test.com, and the invitation to follow is sent to kate@test.com.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kate@test.com

```

Example message sent in reply to the above message containing the invite command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kate@test.com
invite: Invitation sent to kate@test.com

friendlymail, an open-source, email-based, alternative social network

```

As a result of the invite command, a message is sent to the address kate@test.com. This message contains an invitation to follow the friendlymail user with host phil@test.com. Here is an example message containing the invitation:
```
From: Phil L <phil@test.com>
Subject: Phil L wants you to follow them on friendlymail
To: <kate@test.com>

Phil L has invited you to follow them on friendlymail. Follow to receive their updates and photos:

Follow Phil L mailto:<!-- ${replyTo} -->?subject=Fm&body=Follow

friendlymail, an open-source, email-based, alternative social network

```

### follow
The follow command is used to follow a friendlymail user. A friendlymail user account is not required to issue the follow command to a friendlymail host.

### unfollow
The unfollow command is used to unfollow a friendlymail user. A friendlymail user account is not required to issue the unfollow command to a friendlymail host.

### addfollower
The addfollower command is used to add someone as a follower of the host user. The addfollower command differs from the invite command in that no action is required from the invitee to start receiving friendlymail notifications. This command should be used only if permission has previously been obtained from the invitee, or if you are certain the invitee will be interested in receiving your notifications.

The addfollower command can only be used by the host user.

## Create Message
The create message is sent by the user to create new content on friendlymail. After a create message is received, friendlymail will send messages containing the new content to the user's followers.

Here is an example of the create message. The friendlymail user is attached to the host phil@test.com, and the new content is a post containing the text "hello, world".
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

hello, world

```

## Notification Messages
Notification messages are sent by friendlymail to friendlymail users.

### New Post Notification
The new post notification message is sent by friendlymail to friendlymail users. When a user creates a new post, the user's followers are notified via the new post notification message. Here is an example of a create post message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
Message-Id: <74206DB7-D586-4F7D-A203-5C5E1DAE7112@gmail.com>

hello, world

```

Here is an example of a new post notification message which is sent to the followers of phil@test.com. Note that the contents of the Message-Id header are included in the Like and Comment links as a base 64 string. The X-friendlymail header contains metadata in the form of a json string encoded to a base64 string. In this example, the json is shown; for an actual message, the json would be encoded to base 64.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
X-friendlymail: ""

Phil L --> posted:

"hello, world"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

```

### New Like Notification
The new post notification message is sent by friendlymail to friendlymail users. When a user creates a new like on an existing post, the author of the original post is notified via the new like notification message. Here is an example of a new like notification message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

hello, world

```

Here is an example of a new post notification message which is sent to the followers of phil@test.com:
```
Phil L --> posted:

"hello, world"

Like: mailto:<!-- ${replyTo} -->?subject=Fm%20Like:<!-- ${createPostMessageID} -->&body=<!-- ${likeBody} -->
Comment: mailto:<!-- ${replyTo} -->?subject=Fm%20Comment:<!-- ${createPostMessageID} -->

```

### New Comment Notification
The new comment notification message is sent by friendlymail to friendlymail users. When a user creates a new comment on an existing post, the author of the original post is notified via the new comment notification message. Here is an example of a new comment notification message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

hello, world

```

Here is an example of a new post notification message which is sent to the followers of phil@test.com:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

Phil L --> posted:

"hello, world"

Like: mailto:<!-- ${replyTo} -->?subject=Fm%20Like:<!-- ${createPostMessageID} -->&body=<!-- ${likeBody} -->
Comment: mailto:<!-- ${replyTo} -->?subject=Fm%20Comment:<!-- ${createPostMessageID} -->

```
