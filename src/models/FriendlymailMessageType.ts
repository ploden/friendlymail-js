/**
 * Enum representing types of messages sent by friendlymail
 */
export enum FriendlymailMessageType {
    WELCOME = 'welcome',
    HELP = 'help',
    NEW_POST_NOTIFICATION = 'new_post_notification',
    NEW_LIKE_NOTIFICATION = 'new_like_notification',
    NEW_COMMENT_NOTIFICATION = 'new_comment_notification',
    NEW_FOLLOWER_NOTIFICATION = 'new_follower_notification',
    NEW_FOLLOWER_REQUEST_NOTIFICATION = 'new_follower_request_notification',
    NOW_FOLLOWING_NOTIFICATION = 'now_following_notification',
    INVITE = 'invite',
    ADDUSER_RESPONSE = 'adduser_response',
    FOLLOW_RESPONSE = 'follow_response',
    UNFOLLOW_RESPONSE = 'unfollow_response'
}
