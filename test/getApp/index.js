const { expect } = require("chai");
const { createTree, destroyTree } = require("create-fs-tree");
const { tmpdir } = require("os");
const { join } = require("path");
const request = require("supertest");

const getApp = require("getApp");

describe("getApp", () => {
    const baseOptions = {
        delay: 0,
        root: join(tmpdir(), "mock-server/getApp/index"),
        serveConfig: false,
        middleware: "middleware.js"
    };

    afterEach(() => {
        destroyTree(baseOptions.root);
    });

    describe("returns an express app", () => {
        beforeEach(() => {
            const handlerFileContent = `
                module.exports = (req, res) => {
                    res.status(200).send({
                        method: req.method,
                        path: req.path,
                        params: req.params,
                        body: req.body
                    });
                };
            `;
            createTree(baseOptions.root, {
                "middleware.js": `
                    module.exports = [
                        (req, res, next) => {
                            res.set("x-middleware-ran", "true");
                            next();
                        }
                    ]
                `,
                users: {
                    "{userId}": {
                        "get.js": handlerFileContent,
                        "put.js": handlerFileContent,
                        nonHandler: handlerFileContent
                    },
                    "get.js": handlerFileContent,
                    "post.js": handlerFileContent,
                    "nonHandler.js": handlerFileContent
                },
                cookie: {
                    set: {
                        // Sets a cookie for the requester
                        "get.js": `
                            module.exports = (req, res) => {
                                res.cookie("cookie", "test").send();
                            };
                        `
                    },
                    // Returns request cookies
                    "get.js": `
                        module.exports = (req, res) => {
                            res.send(req.cookies)
                        };
                    `
                },
                "get.js": handlerFileContent,
                post: handlerFileContent
            });
        });

        it("whose responses carry cors headers allowing the requesting origin", () => {
            return request(getApp(baseOptions))
                .get("/users/myUserId")
                .set("Origin", "http://localhost:8080")
                .expect(200)
                .expect("Access-Control-Allow-Origin", "http://localhost:8080");
        });

        describe("who handles cookies", () => {
            it("case: allows setting cookies", () => {
                return request(getApp(baseOptions))
                    .get("/cookie/set")
                    .expect("Set-Cookie", "cookie=test; Path=/");
            });

            it("case: correctly parses request cookies", () => {
                return request(getApp(baseOptions))
                    .get("/cookie")
                    .set("Cookie", "cookie=test")
                    .expect({
                        cookie: "test"
                    });
            });
        });

        describe("parsing requests bodies of different content types", () => {
            it("case: application/json bodies parsed as objects", () => {
                return request(getApp(baseOptions))
                    .put("/users/myUserId")
                    .set("Content-Type", "application/json")
                    .send(JSON.stringify({ key: "value" }))
                    .expect(200)
                    .expect({
                        method: "PUT",
                        path: "/users/myUserId",
                        params: {
                            userId: "myUserId"
                        },
                        body: {
                            key: "value"
                        }
                    });
            });

            describe("case: text/* bodies parsed as text", () => {
                it("text/plain", () => {
                    return request(getApp(baseOptions))
                        .put("/users/myUserId")
                        .set("Content-Type", "text/plain")
                        .send("Hello world!")
                        .expect(200)
                        .expect({
                            method: "PUT",
                            path: "/users/myUserId",
                            params: {
                                userId: "myUserId"
                            },
                            body: "Hello world!"
                        });
                });
                it("text/xml", () => {
                    return request(getApp(baseOptions))
                        .put("/users/myUserId")
                        .set("Content-Type", "text/xml")
                        .send("<tag></tag>")
                        .expect(200)
                        .expect({
                            method: "PUT",
                            path: "/users/myUserId",
                            params: {
                                userId: "myUserId"
                            },
                            body: "<tag></tag>"
                        });
                });
            });

            it("case: application/x-www-form-urlencoded parsed as objects", () => {
                return request(getApp(baseOptions))
                    .put("/users/myUserId")
                    .set("Content-Type", "application/x-www-form-urlencoded")
                    .send("greeting=hello&target=world")
                    .expect(200)
                    .expect({
                        method: "PUT",
                        path: "/users/myUserId",
                        params: {
                            userId: "myUserId"
                        },
                        body: {
                            greeting: "hello",
                            target: "world"
                        }
                    });
            });

            it("case: */* (any) bodies parsed as Buffers", () => {
                return request(getApp(baseOptions))
                    .put("/users/myUserId")
                    .set("Content-Type", "application/xml")
                    .send("<tag></tag>")
                    .expect(200)
                    .expect({
                        method: "PUT",
                        path: "/users/myUserId",
                        params: {
                            userId: "myUserId"
                        },
                        // Result of Buffer.from("<tag></tag>").toJSON()
                        body: {
                            type: "Buffer",
                            data: [
                                60,
                                116,
                                97,
                                103,
                                62,
                                60,
                                47,
                                116,
                                97,
                                103,
                                62
                            ]
                        }
                    });
            });
        });

        describe("configured according to the contents of the server root directory", () => {
            it("case: GET /users/:userId", () => {
                return request(getApp(baseOptions))
                    .get("/users/myUserId")
                    .expect(200)
                    .expect({
                        method: "GET",
                        path: "/users/myUserId",
                        params: {
                            userId: "myUserId"
                        },
                        body: {}
                    });
            });

            it("case: PUT /users/:userId", () => {
                return request(getApp(baseOptions))
                    .put("/users/myUserId")
                    .send({ key: "value" })
                    .expect(200)
                    .expect({
                        method: "PUT",
                        path: "/users/myUserId",
                        params: {
                            userId: "myUserId"
                        },
                        body: {
                            key: "value"
                        }
                    });
            });

            it("case: GET /users", () => {
                return request(getApp(baseOptions))
                    .get("/users")
                    .expect(200)
                    .expect({
                        method: "GET",
                        path: "/users",
                        params: {},
                        body: {}
                    });
            });

            it("case: POST /users", () => {
                return request(getApp(baseOptions))
                    .post("/users")
                    .send({ key: "value" })
                    .expect(200)
                    .expect({
                        method: "POST",
                        path: "/users",
                        params: {},
                        body: {
                            key: "value"
                        }
                    });
            });

            it("case: GET /", () => {
                return request(getApp(baseOptions))
                    .get("/")
                    .expect(200)
                    .expect({
                        method: "GET",
                        path: "/",
                        params: {},
                        body: {}
                    });
            });

            it("case: GET /non-existing-path , non existing path", () => {
                return request(getApp(baseOptions))
                    .get("/non-existing-path")
                    .expect(404);
            });

            it("case: POST / , non existing method", () => {
                return request(getApp(baseOptions))
                    .post("/")
                    .expect(404);
            });
        });

        describe("using the specified custom middleware", () => {
            it("case: no custom middleware specified", async () => {
                const response = await request(
                    getApp({ ...baseOptions, middleware: "non-existing.js" })
                )
                    .get("/")
                    .expect(200);
                expect(response.headers).not.to.have.property(
                    "x-middleware-ran"
                );
            });

            it("case: custom middleware specified", () => {
                return request(
                    getApp({ ...baseOptions, middleware: "middleware.js" })
                )
                    .get("/")
                    .expect(200)
                    .expect("x-middleware-ran", "true");
            });
        });

        it("serving /app-config.js when the serveConfig option is true", () => {
            return request(getApp({ ...baseOptions, serveConfig: true }))
                .get("/app-config.js")
                .expect(200)
                .expect("Content-Type", /application\/javascript/)
                .expect(/window\.APP_CONFIG/);
        });

        it("not serving /app-config.js when the serveConfig option is false", () => {
            return request(getApp(baseOptions))
                .get("/app-config.js")
                .expect(404);
        });
    });

    it("throws an error if a handler file doens't export a function", () => {
        createTree(baseOptions.root, {
            "get.js": ""
        });
        const troublemaker = () => {
            getApp(baseOptions);
        };
        expect(troublemaker).to.throw(
            'Handler file for route "GET /" must export a function'
        );
    });
});
