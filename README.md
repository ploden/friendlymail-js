# friendlymail

#### What if Facebook was invented by Linus Torvalds in 1993?

friendlymail is an open-source, email-based, alternative social network. It supports the core features of social networking, such as posting, following, commenting, and liking, all implemented via email. The app is implemented in Typescript, and can then be integrated with an email client to send and receive messages.

# Table of Contents
- [Definitions](#definitions)
- [Message Types](#message-types)
  - [Welcome Message](##welcome-message)
  - [Command Messages](##command-messages)
    - [help](###help)
    - [adduser](###adduser)
    - [invite](###invite)
    - [invite --addfollower](###invite-add-follower)
    - [follow](###follow)
    - [unfollow](###unfollow)
  - [Create Messages](##create-messages)
    - [Create Post Message](###create-post-message)
    - [Create Like Message](###create-like-message)
    - [Create Comment Message](###create-comment-message)
  - [Notification Messages](##notification-messages)
    - [New Post Notification](###new-post-notification)
    - [New Like Notification](###new-like-notification)
    - [New Comment Notification](###new-comment-notification)
    - [New Follower Notification](###new-follower-notification)
    - [New Follower Request Notification](###new-follower-request-notification)
    - [Now Following Notification](###new-following-notification)
- [Data Types](#data-types)
  - [MailProvider](##mailprovider)
  - [ProviderAccount](##provideraccount)   
  - [SocialNetwork](##socialnetwork)


# Definitions
- host: the email account used to send and receive friendlymail messages.
- user: a friendlymail user account for a particular friendlymail user. An account must be attached to a specific host. Commands such as help can be used without an account. Posting requires an account, however.
- host user: the friendlymail user attached to a specific host.
- friendlymail message: an email sent to or from friendlymail. An email received with the subject "Fm", "fm", or "📻" will be processed by friendlymail as a friendlymail message. Emails sent by friendlymail will contain the header X-friendlymail, which contains metadata for that message. The metadata is a json string.

# Message Types
friendly-mail supports the following types of messages:
- Welcome Message
- Command Messages
- Create Messages
- Notification Messages


## Welcome Message
The welcome message is sent when friendlymail is configured with a host. The welcome message briefly explains what friendlymail is, and informs the user that they can use the help command for more information. A welcome message should be sent once and only once to the host.

Here is an example Welcome Message:
```
From: Phil L <phil@test.com>
Subject: Welcome to friendlymail!
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

help: mailto:phil@test.com?subject=Fm&body=%24%20help

friendlymail, an open-source, email-based, alternative social network
```

## Command Messages
friendlymail supports commands, similar to a CLI. A command must be preceded by "$". Some commands are only supported when the sender is the host. Others are supported for any sender. For example, the "help" command may be used by any sender. The "adduser" command may only be used by the host. The following commands are supported.

friendly-mail supports the following types of command messages:
- [help](###help)
- adduser
- invite
- follow

### help
The help command provides information about friendlymail. When a message with subject "Fm" and body "$ help" is sent to the host, a help message should be sent in reply.

Here is an example message containing the help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ help

```

Here is an example message sent in reply to the above message containing the help command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

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

### adduser
The adduser command is used to create a friendlymail user, which is required for posting.

Here is an example message containing the adduser command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Here is an example message sent in reply to the above message containing the adduser command:
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
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser

```

Here is an example message sent in reply to the above message containing the adduser command, where the sender does not match the host address:
```
From: Kath L <kath@test.com>
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

Here is an example message sent in reply to the above message containing the adduser command, where a user has already been created for this host:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ adduser
adduser: Fatal: a friendlymail user already exists for phil@test.com

friendlymail, an open-source, email-based, alternative social network

```

### invite
The invite command is used to invite someone to follow the host user. The invite command can only be used by the host user.

Here is an example of the invite command. The friendlymail user is attached to the host phil@test.com, and the invitation to follow is sent to kath@test.com.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kath@test.com

```

Here is an example message sent in reply to the above message containing the invite command:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kath@test.com
invite: Invitation sent to kath@test.com

friendlymail, an open-source, email-based, alternative social network

```

As a result of the invite command, a message is sent to the address kath@test.com. This message contains an invitation to follow the friendlymail user with host phil@test.com. Here is an example message containing the invitation:
```
From: Phil L <phil@test.com>
Subject: Phil L wants you to follow them on friendlymail
To: <kath@test.com>

Phil L has invited you to follow them on friendlymail. Follow to receive their posts and photos:

Follow Phil L: mailto:phil@test.com?subject=Fm&body=%24%20follow

friendlymail, an open-source, email-based, alternative social network

```

When the recipient of the above message opens the link and sends the message, they will be added as a follower of phil@test.com. If the recipient were to send a message containing the follow command, they would also be added as a follower of phil@test.com. See the follow command below for more details on the follow command.

After the message containing the follow command is received, the friendlymail user attached to the host phil@test.com will receive a New Follower notification message.

The invite command may only be used after a friendlymail user has been attached to the host. Here is an example message sent in reply to the invite command when a friendlymail user has not been attached to the host.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ invite kath@test.com
invite: Fatal: a friendlymail user account is required for this command.

friendlymail, an open-source, email-based, alternative social network

```

### invite --addfollower
The invite command with the addfollower parameter is used to add someone as a follower of the host user. This differs from the invite command in that no action is required from the invitee to start receiving friendlymail notifications. This should be used only if permission has previously been obtained from the invitee, or if you are certain the invitee will be interested in receiving your notifications.

The invite command with the addfollower parameter can only be used by the host user.

### follow
The follow command is used to follow a friendlymail user. The command is sent to the host attached to the friendlymail user that is the intended followee. A friendlymail user account is not required to issue the follow command to a friendlymail host.

Here is an example message containing the follow command. In this example, the friendlymail host is phil@test.com.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ follow

```

The response is determined by the settings of the followee. A friendlymail user can automatically accept follow requests. Otherwise, approval is required for the request to be accepted.

Here is an example message sent in reply to the above message containing the follow command. The followee has configured their account to automatically accept follow requests.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>

$ follow
follow: You are now following phil@test.com.

friendlymail, an open-source, email-based, alternative social network

```

Here is an example message sent in reply to a message containing the follow command. In this case, the followee has configured their account to require approval to accept follow requests.

```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>

$ follow
follow: A follow request has been sent to phil@test.com.

friendlymail, an open-source, email-based, alternative social network

```

### unfollow
The unfollow command is used to unfollow a friendlymail user. A friendlymail user account is not required to issue the unfollow command to a friendlymail host.

Here is an example message containing the unfollow command. In this example, the friendlymail host is phil@test.com.
```
From: Kath L <kath@test.com>
Subject: Fm
To: Phil L <phil@test.com>

$ unfollow

```

Here is an example message sent in reply to the above message containing the unfollow command. This reply will be sent regardless of whether the sender is currently following the host user.
```
From: Phil L <phil@test.com>
Subject: Fm
To: Kath L <kath@test.com>

$ unfollow
unfollow: You are no longer following phil@test.com.

friendlymail, an open-source, email-based, alternative social network

```

## Create Messages
The create message is sent by the user to create new content on friendlymail. After a create message is received, friendlymail will send messages containing the new content to the user's followers.

Here is an example of the create message. The friendlymail user is attached to the host phil@test.com, and the new content is a post containing the text "hello, world".
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>

hello, world

```

## Notification Messages
Notification messages are sent by friendlymail to the host user and to the followers of the host user. Note that the followers do not necessarily have friendlymail user accounts.

### New Post Notification
The new post notification message is sent by friendlymail to the followers of the host user. When a user creates a new post, the user's followers are notified via the new post notification message. Here is an example of a create post message:
```
From: Phil L <phil@test.com>
Subject: Fm
To: Phil L <phil@test.com>
Message-Id: <74206DB7-D586-4F7D-A203-5C5E1DAE7112@gmail.com>

hello, world

```

Here is an example of a new post notification message which is sent to the followers of phil@test.com. Note that the contents of the Message-Id header are included in the Like and Comment links as a base 64 string. The X-friendlymail header contains metadata in the form of a json string encoded to a Quoted-Printable string. In this example, the json is shown; for an actual message, the json would be encoded to Quoted-Printable.
```
From: Phil L <phil@test.com>
Subject: friendlymail: New post from Phil L
To: Phil L <phil@test.com>
X-friendlymail: ""

Phil L --> posted:

"hello, world"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

friendlymail, an open-source, email-based, alternative social network

```

### New Like Notification
The new like notification message is sent by friendlymail to the host user. When a follower likes a post that the host user has created, the host user is notified via the new like notification message.

Here is an example of a new like notification message. In this example, the friendlymail host is phil@test.com. The follower with address kath@test.com has liked a post by the host user.
```
From: Phil L <phil@test.com>
Subject: friendlymail: Kath L liked your post...
To: Phil L <phil@test.com>

Kath L --> liked your post.

Phil L:
"hello, world"

Kath L:
"❤️"

friendlymail, an open-source, email-based, alternative social network

```

### New Comment Notification
The new comment notification message is sent by friendlymail to the followers of the host user. When a user creates a new comment on an existing post, the author of the original post is notified via the new comment notification message. Here is an example of a new comment notification message:
```
From: Phil L <phil@test.com>
Subject: friendlymail: New comment from Kath L
To: Phil L <phil@test.com>

Kath L --> commented on your post:

"hello, universe!"

Like ❤️: mailto:phil@test.com?subject=Fm%20Like%20❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+&body=❤️
Comment 💬: mailto:phil@test.com?subject=Fm%20Comment%20💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+

Comment thread:

Phil L:
"hello, world"

Kath L:
"hello, universe!"

friendlymail, an open-source, email-based, alternative social network

```

# Data Types

Many data types are defined within friendlymail.

## SimpleMessage

The SimpleMessage defines the interface for the most basic message type. It includes attributes for From, To, Subject, message body, and Date. It can also include an optional X-friendlymail value, which corresponds to an email header.

## MessageSender

MessageSender defines the interface for a data type capable of sending messages. The interface declares a method sendDraft that will send a draft message.

## MessageReceiver

MessageReceiver defines the interface for a data type capable of receiving messages. The interface declares a method getMessages that will retrieve messages from the server.

## MailProvider

MailProvider is a data type for sending and receiving email messages. It implements both MessageSender and MessageReceiver.

## MessageStore

MessageStore is a data type for storing the messages received from a MessageReceiver. The MessageStore also stores messages that should be sent using a MessageSender. A MessageStore contains an allMessages property for storing all messages, and a draftMessages property for storing messages that should be sent by a MessageSender.

## MessageProcessor

MessageProcessor is a data type for processing the messages contained in a MessageStore. Based on the contents of the MessageStore, the processor will create draft messages to be sent. As soon as a draft is created, the MessageProcessor should stop processing messages. If a SocialNetwork object is passed into the MessageProcessor, the MessageProcessor will update the SocialNetwork object. Otherwise, the MessageProcessor will create a new SocialNetwork object.

## SocialNetwork
SocialNetwork is the data type for representing the social network for a specific host user. It includes data types such as followers, posts, comments, and likes. The SocialNetwork object is modified by the MessageProcessor based on the contents of a MessageStore. For example, if a follow message is processed, the MessageProcessor will add the sender as a follower of the host user.

## TestMessageProvider

The TestMessageProvider is used for testing and in the simulator. It implements MessageSender and MessageReceiver, and loads messages from files. If a file contains <host_address> as the To or From field, the email address of the host user will be used.

## Daemon
The Daemon uses the main friendlymail data types to send and receive friendlymail messages. A Daemon will:
- use a MessageStore to store messages
- use a MessageReceiver to populate the MessageStore with messages
- use a MessageSender to send friendlymail messages
- use a MessageProcessor to process the messages in the MessageStore
- use a SocialNetwork to save the changes made by the MessageProcessor

# Simulator

friendlymail also includes a simulator for processing simulated messages and showing the resulting output.

```
npm run process -- --host-email phil@test.com --host-name "Phil L"
```

After starting the simulator with an empty MessageStore, a Welcome Message should be added to drafts. The simulator user can send the draft using the send command:

```
> send $1
```

This will send the first available draft, which will move the message from Drafts to Sent. Drafts should then be empty, and Sent should contain one message.
