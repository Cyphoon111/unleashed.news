// Every request to the bare domain goes to the same path on www, permanently.
export default {
  fetch(req) {
    const u = new URL(req.url);
    u.hostname = 'www.unleashed.news';
    u.protocol = 'https:';
    return Response.redirect(u.toString(), 301);
  },
};
