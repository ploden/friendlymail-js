# friendlymail-js

friendly-mail is an email-based social network. It supports the core features of a social network, such as posting, following, commenting, and liking, all implemented via email. The logic is implemented in Typescript, and can then be integrated with an email client to send and receive messages.

## Definitions
- host: the email account used to send and receive friendlymail messages.
- account: the friendlymail user account for a particular friendlymail user. Commands such as help can be used without an account. Posting requires an account, however. 

## Message Types
### Welcome Message
The welcome message is sent when friendlymail is configured with a host. The welcome message briefly explains what friendlymail is, and informs the user that they can use the help command for more information. A welcome message should be sent once and only once to the host.

Example Welcome Message:
```
   __      _                _ _                       _ _
  / _|    (_)              | | |                     (_) |
 | |_ _ __ _  ___ _ __   __| | |_   _ _ __ ___   __ _ _| |
 |  _| '__| |/ _ \ '_ \ / _` | | | | | '_ ` _ \ / _` | | |
 | | | |  | |  __/ | | | (_| | | |_| | | | | | | (_| | | |
 |_| |_|  |_|\___|_| |_|\__,_|_|\__, |_| |_| |_|\__,_|_|_|
                                 __/ |
                                |___/
friendlymail 0.0.1
Reply to this message with "help" for more information.

friendlymail, an open-source, email-based, alternative social network
```

### Command Messages
friendlymail supports commands, similar to a CLI. Some commands are only supported when the sender is the host. Others are supported for any sender. For example, the "help" command may be used by any sender. The "useradd" command may only be used by the host. The following commands are supported.

#### help
The help command provides information about friendlymail. When a message with subject "Fm" and body "help" is sent to the host, a help message should be sent in reply.

Example message sent in response to "help":
```
$ help
friendlymail: friendlymail, version 0.0.1
These shell commands are defined internally.  Type `help' to see this list.
Type `help name' to find out more about the function `name'.

useradd
help

friendlymail, an open-source, email-based, alternative social network

```

#### useradd
The useradd command is used to create a friendlymail account, which is required for posting. 

Example message sent in response to "useradd":
```
$ useradd
Usage: useradd -n NAME -e EMAIL

friendlymail, an open-source, email-based, alternative social network

```
