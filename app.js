const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//AUTHENTICATION TOKEN
const authenticateToken = (request, response, next) => {
  let jwtToken;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];

    jwt.verify(jwtToken, "Jaisriram", (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// API 1 register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user 
        (username, password,name,gender)
        VALUES (
            '${username}',
            '${hashPassword}',
            '${name}',
            '${gender}'
        );`;
      await db.run(createUserQuery);

      response.send("User created successfully");
    }
  }
});

// API 2 Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "Jaisriram");
      response.send({ jwtToken });
      console.log({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API3 GET user/tweets/feed/

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  console.log("jaiSriRam");
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  const getFollowQuery = `
  SELECT 
  following_user_id 
  FROM 
  follower
  WHERE follower_user_id = ${dbUser.user_id};`;
  const followingUser = await db.all(getFollowQuery);
  const followingUserList = followingUser.map((each) => {
    return each["following_user_id"];
  });
  const getTweetQuery = `
SELECT 
user.username AS username,
tweet.tweet AS tweet,
tweet.date_time AS dateTime
FROM 
tweet INNER JOIN user ON tweet.user_id = user.user_id
WHERE tweet.user_id IN (
    ${followingUserList}
)
ORDER BY tweet.date_time DESC
LIMIT 4;`;
  const sendTweets = await db.all(getTweetQuery);
  response.send(sendTweets);
});

// API 4 - /user/following/
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const followerQuery = `SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};`;
  const followerList = await db.all(followerQuery);
  const followerArray = followerList.map((each) => {
    return each["following_user_id"];
  });
  const getUserNameQuery = `SELECT user.name AS name FROM user
    WHERE user_id IN ( ${followerArray});`;
  const followUser = await db.all(getUserNameQuery);
  response.send(followUser);
});

// API 5 - /user/followers/
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  const followerQuery = `SELECT follower_user_id FROM follower 
    WHERE following_user_id = ${dbUser.user_id};`;
  const followerList = await db.all(followerQuery);
  const followerArray = followerList.map((each) => {
    return each["follower_user_id"];
  });
  const getUserNameQuery = `SELECT user.name AS name FROM user
    WHERE user_id IN ( ${followerArray});`;
  const followUser = await db.all(getUserNameQuery);
  response.send(followUser);
});

//API 6 /tweets/:tweetId/

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  const selectTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetDetails = await db.get(selectTweetQuery);

  const followingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${dbUser.user_id};`;
  const followingUserArray = await db.all(followingUserQuery);

  const followingUserList = followingUserArray.map((each) => {
    return each["following_user_id"];
  });
  if (followingUserList.includes(tweetDetails.user_id)) {
    const { tweet_id, date_time, tweet } = tweetDetails;
    const getLikesQuery = `SELECT COUNT(like_id) AS likes
    FROM like WHERE
     tweet_id = ${tweet_id} 
     GROUP BY tweet_id;`;

    const likesArray = await db.get(getLikesQuery);
    const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const repliesObject = await db.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesArray.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await db.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikesQuery = `
        SELECT user_id FROM like 
        WHERE tweet_id = ${tweet_id};
        `;
      const likedUserIdObjectsList = await db.all(getLikesQuery);
      const likedUserIdsList = likedUserIdObjectsList.map((object) => {
        return object.user_id;
      });
      const getLikedUsersQuery = `
      SELECT username FROM user 
      WHERE user_id IN (${likedUserIdsList});
      `;
      const likedUsersObjectsList = await db.all(getLikedUsersQuery);
      const likedUsersList = likedUsersObjectsList.map((object) => {
        return object.username;
      });
      response.send({
        likes: likedUsersList,
      });
    }
  }
);

// API 8 /tweets/:tweetId/replies/
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await db.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM reply 
    INNER JOIN user ON reply.user_id = user.user_id 
    WHERE reply.tweet_id = ${tweet_id};
    `;
      const userRepliesObject = await db.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

// API 9 /user/tweets/

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;

  const getTweetsQuery = `
  SELECT * FROM tweet WHERE user_id = ${user_id}
  ORDER BY tweet_id;
  `;
  const tweetObjectsList = await db.all(getTweetsQuery);

  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });

  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const likesObjectsList = await db.all(getLikesQuery);
  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const repliesObjectsList = await db.all(getRepliesQuery);
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

// API 10 /user/tweets/

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const addNewTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time) 
  VALUES ('${tweet}', ${user_id}, '${dateTime}');
  `;
  await db.run(addNewTweetQuery);
  response.send("Created a Tweet");
});

// API 11 /tweets/:tweetId/

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);
    if (dbUser.user_id !== tweetInfo.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
