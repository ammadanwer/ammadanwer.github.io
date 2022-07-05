/* Change this file to get your personal Portfolio */

// To change portfolio colors globally go to the  _globalColor.scss file

import emoji from "react-easy-emoji";
import splashAnimation from "./assets/lottie/splashAnimation"; // Rename to your file name for custom animation

// Splash Screen

const splashScreen = {
  enabled: true, // set false to disable splash screen
  animation: splashAnimation,
  duration: 2000 // Set animation duration as per your animation
};

// Summary And Greeting Section

const illustration = {
  animated: true // Set to false to use static SVG
};

const greeting = {
  username: "Muhammad Ammad",
  title: "Hi, I'm Ammad",
  subTitle: emoji(
    "A Software / Data Engineer with 8+ years of experience in various technology stacks. Currently working with Python / Django / Flask / Airflow / Postgres / Redshift / AWS / Prometheus"
  ),
  resumeLink:
    "https://drive.google.com/file/d/1-7tC_FFUwnR7xHj-KfckuWsFzFi-cQi4/view?usp=sharing", // Set to empty to hide the button
  displayGreeting: true // Set false to hide this section, defaults to true
};

// Social Media Links

const socialMediaLinks = {
  github: "https://github.com/ammadanwer",
  linkedin: "https://www.linkedin.com/in/m-ammad/",
  gmail: "ammad.anwer@gmail.com",
  // Instagram, Twitter and Kaggle are also supported in the links!
  // To customize icons and social links, tweak src/components/SocialMedia
  display: true // Set true to display this section, defaults to false
};

// Skills Section

const skillsSection = {
  title: "What I do",
  subTitle: "SOFTWARE ARCHITECT WHO LOVES DESIGNING AND BUILDING END-TO-END SOLUTIONS",
  skills: [
    emoji(
      "⚡ Design and develop Data and Software Solutions mainly on AWS"
    ),
    emoji("⚡ Ingest large scale batch and streaming data and provide solutions on top"),
    emoji(
      "⚡ Architect and develop highly resilient and fault-tolerant web application"
    ),
    emoji("⚡ Mentor Junior Engineers and Lead small but efficient teams to deliver quality software solutions"),
    emoji("⚡ Do Unit testing and code reviews to standardise software development practices")
  ],

  /* Make Sure to include correct Font Awesome Classname to view your icon
https://fontawesome.com/icons?d=gallery */

  softwareSkills: [
    {
      skillName: "sql-database",
      fontAwesomeClassname: "fas fa-database"
    },
    {
      skillName: "aws",
      fontAwesomeClassname: "fab fa-aws"
    },
    {
      skillName: "lambda",
      fontAwesomeClassname: "fas fa-lambda"
    },
    {
      skillName: "firebase",
      fontAwesomeClassname: "fas fa-fire"
    },
    {
      skillName: "python",
      fontAwesomeClassname: "fab fa-python"
    },
    {
      skillName: "docker",
      fontAwesomeClassname: "fab fa-docker"
    },
    {
      skillName: "django",
      fontAwesomeClassname: "fas fa-globe"
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Education Section

const educationInfo = {
  display: true, // Set false to hide this section, defaults to true
  schools: [
    {
      schoolName: "National University of Computer and Emerging Sciences",
      logo: require("./assets/images/nu-logo.jpeg"),
      subHeader: "Bachelors of Science in Computer Science",
      duration: "October 2010 - June 2014",
      desc: "",
      descBullets: []
    }]
};

// Your top 3 proficient stacks/tech experience

const techStack = {
  viewSkillBars: false, //Set it to true to show Proficiency Section
  experience: [
    {
      Stack: "Frontend/Design", //Insert stack or technology you have experience in
      progressPercentage: "90%" //Insert relative proficiency in percentage
    },
    {
      Stack: "Backend",
      progressPercentage: "70%"
    },
    {
      Stack: "Programming",
      progressPercentage: "60%"
    }
  ],
  displayCodersrank: false // Set true to display codersrank badges section need to changes your username in src/containers/skillProgress/skillProgress.js:17:62, defaults to false
};

// Work experience section

const workExperiences = {
  display: true, //Set it to true to show workExperiences Section
  experience: [
    {
      role: "Senior Software / Data Engineer",
      company: "Bais Set Ventures",
      companylogo: require("./assets/images/bsv.jpeg"),
      date: "June 2019 – Present",
      desc: "AWS EC2, ECS, S3, SQS, Lambda, Airtable, Postgres, Redis, Jenkins, Airflow, Selenium, Beautifulsoup, Pandas, Python, Flask, Django, React, Nextjs, Git",
    },
    {
      role: "Senior Software Engineer | Team Lead",
      company: "Arbisoft",
      companylogo: require("./assets/images/arbisoft-logo.jpeg"),
      date: "September 2018 – August 2019",
      desc: "Python, AWS, Redshift, Kafka, InfluxDB, Grafana, Postgres"
    },
    {
      role: "Senior Software Engineer | API Team Lead",
      company: "Zameen",
      companylogo: require("./assets/images/Zameen-Logo.jpg"),
      date: "March 2017 – September 2018",
      desc: "PHP, Algolia, Python, MySQL, Git, Linux Servers"
    },
    {
      role: "Software Engineer | Switch Interface",
      company: "Afiniti",
      companylogo: require("./assets/images/afiniti-logo.png"),
      date: "June 2014 – March 2017",
      desc: "Integration with various Telephony Switch Interfaces using their SDKs and C#."
    }
  ]
};

/* Your Open Source Section to View Your Github Pinned Projects
To know how to get github key look at readme.md */

const openSource = {
  showGithubProfile: "true", // Set true or false to show Contact profile using Github, defaults to true
  display: true // Set false to hide this section, defaults to true
};

// Some big projects you have worked on

const bigProjects = {
  title: "Big Projects",
  subtitle: "SOME STARTUPS AND COMPANIES THAT I HELPED TO CREATE THEIR TECH",
  projects: [
    {
      image: require("./assets/images/saayaHealthLogo.webp"),
      projectName: "Saayahealth",
      projectDesc: "Lorem ipsum dolor sit amet, consectetur adipiscing elit",
      footerLink: [
        {
          name: "Visit Website",
          url: "http://saayahealth.com/"
        }
        //  you can add extra buttons here.
      ]
    },
    {
      image: require("./assets/images/nextuLogo.webp"),
      projectName: "Nextu",
      projectDesc: "Lorem ipsum dolor sit amet, consectetur adipiscing elit",
      footerLink: [
        {
          name: "Visit Website",
          url: "http://nextu.se/"
        }
      ]
    }
  ],
  display: false // Set false to hide this section, defaults to true
};

// Achievement Section
// Include certificates, talks etc

const achievementSection = {
  title: emoji("Achievements And Certifications 🏆 "),
  subtitle:
    "Achievements, Certifications, Award Letters and Some Cool Stuff that I have done !",

  achievementsCards: [
    {
      title: "AWS Certified Cloud Practitioner",
      subtitle:"",
      image: require("./assets/images/aws-logo.jpeg"),
      footerLink: [
        {
          name: "Certification",
          url: "https://www.youracclaim.com/badges/3850593b-9680-48a0-8632-d398267ed43d"
        }
      ]
    },
    {
      title: "Udacity Data Engineer Nanodegree",
      subtitle:"",
      image: require("./assets/images/udacity-logo.webp"),
      footerLink: [
        {
          name: "Nanodegree",
          url: "https://graduation.udacity.com/confirm/ECMURDF"
        }
      ]
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Blogs Section

const blogSection = {
  title: "Blogs",
  subtitle:
    "With Love for Developing cool stuff, I love to write and teach others what I have learnt.",
  displayMediumBlogs: "true", // Set true to display fetched medium blogs instead of hardcoded ones
  blogs: [
    {
      url: "https://blog.usejournal.com/create-a-google-assistant-action-and-win-a-google-t-shirt-and-cloud-credits-4a8d86d76eae",
      title: "Win a Google Assistant Tshirt and $200 in Google Cloud Credits",
      description:
        "Do you want to win $200 and Google Assistant Tshirt by creating a Google Assistant Action in less then 30 min?"
    },
    {
      url: "https://medium.com/@saadpasta/why-react-is-the-best-5a97563f423e",
      title: "Why REACT is The Best?",
      description:
        "React is a JavaScript library for building User Interface. It is maintained by Facebook and a community of individual developers and companies."
    }
  ],
  display: false // Set false to hide this section, defaults to true
};

// Talks Sections

const talkSection = {
  title: "TALKS",
  subtitle: emoji(
    "I LOVE TO SHARE MY LIMITED KNOWLEDGE AND GET A SPEAKER BADGE 😅"
  ),

  talks: [
    {
      title: "Build Actions For Google Assistant",
      subtitle: "Codelab at GDG DevFest Karachi 2019",
      slides_url: "https://bit.ly/saadpasta-slides",
      event_url: "https://www.facebook.com/events/2339906106275053/"
    }
  ],
  display: false // Set false to hide this section, defaults to true
};

// Podcast Section

const podcastSection = {
  title: emoji("Podcast 🎙️"),
  subtitle: "I LOVE TO TALK ABOUT MYSELF AND TECHNOLOGY",

  // Please Provide with Your Podcast embeded Link
  podcast: [
    "https://anchor.fm/codevcast/embed/episodes/DevStory---Saad-Pasta-from-Karachi--Pakistan-e9givv/a-a15itvo"
  ],
  display: false // Set false to hide this section, defaults to true
};

const contactInfo = {
  title: emoji("Contact Me ☎️"),
  subtitle:
    "Discuss a project or just want to say hi? My Inbox is open for all.",
  number: "+92-3006933846",
  email_address: "ammad.anwer@gmail.com"
};

// Twitter Section

const twitterDetails = {
  userName: "twitter", //Replace "twitter" with your twitter username without @
  display: false // Set true to display this section, defaults to false
};

export {
  illustration,
  greeting,
  socialMediaLinks,
  splashScreen,
  skillsSection,
  educationInfo,
  techStack,
  workExperiences,
  openSource,
  bigProjects,
  achievementSection,
  blogSection,
  talkSection,
  podcastSection,
  contactInfo,
  twitterDetails
};
