fetch("http://localhost:3000/posts")
  .then(res => res.json())
  .then(data => {
    const feed = document.getElementById("feed");
    feed.innerHTML = "";

    data.forEach(post => {
      const div = document.createElement("div");
      div.className = "post";

      div.innerHTML = `
        <img src="http://localhost:3000/${post.image_path}" />
        <h3>${post.restaurant_name}</h3>
        <p>${post.caption}</p>
      `;

      feed.appendChild(div);
    });
  })
  .catch(err => console.error(err));
const form = document.getElementById("postForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch("http://localhost:3000/create-post", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        alert("Post created!");

        // reload feed
        location.reload();
      } else {
        alert("Error creating post");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });
}